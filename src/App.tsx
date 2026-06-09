/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import MasterDataView from "./components/MasterDataView";
import LabelMasterView from "./components/LabelMasterView";
import CardDrawingView from "./components/CardDrawingView";
import LoginGate from "./components/LoginGate";
import type {
  IChingCard,
  LabelGroup,
  Label,
  SpreadCard,
  SavedCanvas,
  MasterDataSnapshot,
} from "./types";
import { INITIAL_CARDS, TAROT_CARDS } from "./constants";
import type { User } from "@supabase/supabase-js";
import { clearStoredAuthSession, supabase } from "./supabaseClient";
import { LogOut } from "lucide-react";
import {
  db,
  collection,
  onSnapshot,
  query,
  doc,
  writeBatch,
  orderBy,
  getDocs,
} from "./lib/supabaseDb";
import SavedCanvasesView from "./components/SavedCanvasesView";
import { handleSupabaseError, OperationType } from "./lib/supabaseErrors";
import { isAuthorizedAppEmail } from "./lib/appAuth";
import { toast } from "sonner";
import {
  MASTER_DATA_MARKER_COLLECTION,
  MASTER_DATA_MARKER_ID,
  createMasterDataVersion,
  writeMasterDataMarker,
} from "./lib/masterDataCache";

const getIChingMetadataPatch = (current: Partial<IChingCard>) => {
  const expected = INITIAL_CARDS.find((card) => card.id === current.id);
  if (!expected) return null;

  const patch: Partial<IChingCard> = {};
  if (current.vietnameseName !== expected.vietnameseName) {
    patch.vietnameseName = expected.vietnameseName;
  }
  if (current.englishName !== expected.englishName) {
    patch.englishName = expected.englishName;
  }
  if (current.link1 !== expected.link1) {
    patch.link1 = expected.link1;
  }
  if (current.link2 !== expected.link2) {
    patch.link2 = expected.link2;
  }
  if (current.link3 !== expected.link3) {
    patch.link3 = expected.link3;
  }
  const currentKeywords = current.keywords?.trim() || "";
  if (
    expected.keywords &&
    (!currentKeywords ||
      /Triệu và Điềm:|Từ khóa Việt:|English keywords:/i.test(currentKeywords))
  ) {
    patch.keywords = expected.keywords;
  }
  if (expected.content1 && current.content1 !== expected.content1) {
    patch.content1 = expected.content1;
  }

  return Object.keys(patch).length > 0 ? patch : null;
};

const sortBySortOrder = <T extends { sortOrder?: number; id: string }>(
  items: T[],
) =>
  [...items].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
  );

const sortMasterDataSnapshot = (
  snapshot: MasterDataSnapshot,
): MasterDataSnapshot => ({
  version: snapshot.version,
  cards: [...snapshot.cards].sort((a, b) => a.number - b.number),
  labelGroups: sortBySortOrder(snapshot.labelGroups),
  labels: sortBySortOrder(snapshot.labels),
});

export default function App() {
  const [activeTab, setActiveTab] = useState("drawing");
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [cards, setCards] = useState<IChingCard[]>(INITIAL_CARDS);
  const [labelGroups, setLabelGroups] = useState<LabelGroup[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [spreadCards, setSpreadCards] = useState<SpreadCard[]>([]);
  const [savedCanvases, setSavedCanvases] = useState<SavedCanvas[]>([]);
  const [loadCanvas, setLoadCanvas] = useState<SavedCanvas | null>(null);
  const [masterDataVersion, setMasterDataVersion] = useState("");
  const [isSyncingMasterData, setIsSyncingMasterData] = useState(false);
  const cardsRef = useRef(cards);
  const labelGroupsRef = useRef(labelGroups);
  const labelsRef = useRef(labels);
  const masterDataVersionRef = useRef(masterDataVersion);
  const isMasterDataFetchingRef = useRef(false);
  const allCards = useMemo(
    () => [
      ...cards.map((card) => ({ ...card, deckType: "iching" as const })),
      ...TAROT_CARDS,
    ],
    [cards],
  );

  const isAuthorizedUser = isAuthorizedAppEmail(user?.email);
  const masterDataScope = useMemo(() => {
    if (!isAuthorizedUser || !user?.email) return null;

    return {
      projectId: import.meta.env.VITE_SUPABASE_URL || "local-supabase",
      userEmail: user.email,
    };
  }, [isAuthorizedUser, user?.email]);

  const applyMasterDataSnapshot = useCallback((snapshot: MasterDataSnapshot) => {
    const sortedSnapshot = sortMasterDataSnapshot(snapshot);

    cardsRef.current = sortedSnapshot.cards;
    labelGroupsRef.current = sortedSnapshot.labelGroups;
    labelsRef.current = sortedSnapshot.labels;
    masterDataVersionRef.current = sortedSnapshot.version;

    setCards(sortedSnapshot.cards);
    setLabelGroups(sortedSnapshot.labelGroups);
    setLabels(sortedSnapshot.labels);
    setMasterDataVersion(sortedSnapshot.version);
  }, []);

  const handleMasterDataWritten = useCallback(
    (version: string) => {
      if (!version) return;

      masterDataVersionRef.current = version;
      setMasterDataVersion(version);
    },
    [],
  );

  const fetchMasterDataFromDb = useCallback(
    async ({
      version,
      forceMarkerWrite = false,
    }: {
      version?: string;
      forceMarkerWrite?: boolean;
    } = {}) => {
      if (!db || !masterDataScope || isMasterDataFetchingRef.current) {
        return null;
      }

      isMasterDataFetchingRef.current = true;

      try {
        const [cardsSnap, groupsSnap, labelsSnap] = await Promise.all([
          getDocs(collection(db, "iching_cards_master")),
          getDocs(collection(db, "label_groups")),
          getDocs(collection(db, "labels")),
        ]);

        const updatedAt = new Date().toISOString();
        const batch = writeBatch(db);
        let hasBatchWrites = false;
        let nextCards: IChingCard[];

        if (cardsSnap.empty) {
          nextCards = INITIAL_CARDS.map((card) => ({ ...card }));
          nextCards.forEach((card) => {
            batch.set(doc(db, "iching_cards_master", card.id), {
              ...card,
              createdAt: updatedAt,
              updatedAt,
            });
          });
          hasBatchWrites = true;
        } else {
          const cardsById = new Map<string, IChingCard>();
          cardsSnap.docs.forEach((cardDoc) => {
            cardsById.set(cardDoc.id, {
              ...(cardDoc.data() as Partial<IChingCard>),
              id: cardDoc.id,
              deckType: "iching",
            } as IChingCard);
          });

          cardsSnap.docs.forEach((cardDoc) => {
            const current = cardsById.get(cardDoc.id);
            if (!current) return;

            const patch = getIChingMetadataPatch(current);
            if (!patch) return;

            cardsById.set(cardDoc.id, {
              ...current,
              ...patch,
            });
            batch.set(
              doc(db, "iching_cards_master", cardDoc.id),
              {
                ...patch,
                updatedAt,
              },
              { merge: true },
            );
            hasBatchWrites = true;
          });

          nextCards = Array.from(cardsById.values());
        }

        const nextLabelGroups = groupsSnap.docs.map(
          (groupDoc) =>
            ({
              ...(groupDoc.data() as Partial<LabelGroup>),
              id: groupDoc.id,
            }) as LabelGroup,
        );
        const nextLabels = labelsSnap.docs.map(
          (labelDoc) =>
            ({
              ...(labelDoc.data() as Partial<Label>),
              id: labelDoc.id,
            }) as Label,
        );

        const nextVersion = forceMarkerWrite
          ? version || createMasterDataVersion()
          : hasBatchWrites || !version
            ? createMasterDataVersion()
            : version;

        if (forceMarkerWrite || hasBatchWrites || !version) {
          writeMasterDataMarker({ batch, db }, nextVersion);
          hasBatchWrites = true;
        }

        if (hasBatchWrites) {
          await batch.commit();
        }

        const snapshot = sortMasterDataSnapshot({
          version: nextVersion,
          cards: nextCards,
          labelGroups: nextLabelGroups,
          labels: nextLabels,
        });
        applyMasterDataSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        handleSupabaseError(error, OperationType.GET, "master_data");
        return null;
      } finally {
        isMasterDataFetchingRef.current = false;
      }
    },
    [applyMasterDataSnapshot, masterDataScope],
  );

  const handleSyncMasterData = useCallback(async () => {
    if (!db || !masterDataScope || isSyncingMasterData) return;

    setIsSyncingMasterData(true);
    try {
      const snapshot = await fetchMasterDataFromDb({
        version: createMasterDataVersion(),
        forceMarkerWrite: true,
      });
      if (snapshot) {
        toast.success("Master data synced from Supabase");
      }
    } catch (error) {
      console.error("Sync master data failed:", error);
      toast.error("Failed to sync master data");
    } finally {
      setIsSyncingMasterData(false);
    }
  }, [fetchMasterDataFromDb, isSyncingMasterData, masterDataScope]);

  const handleSignOut = useCallback(async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      clearStoredAuthSession();
      setUser(null);
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    let isMounted = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!isMounted) return;
        setUser(data.user);
        setIsAuthReady(true);
      })
      .catch((error) => {
        console.error("Load Supabase user failed:", error);
        if (isMounted) setIsAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Versioned master data sync
  useEffect(() => {
    if (!db || !isAuthReady || !isAuthorizedUser) return;

    if (!masterDataScope) return;

    const unsubMasterDataMarker = onSnapshot(
      doc(db, MASTER_DATA_MARKER_COLLECTION, MASTER_DATA_MARKER_ID),
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;

        const remoteVersion = snapshot.exists()
          ? (snapshot.data()?.version as string | undefined)
          : undefined;

        if (remoteVersion && remoteVersion === masterDataVersionRef.current) {
          return;
        }

        void fetchMasterDataFromDb({
          version: remoteVersion || createMasterDataVersion(),
          forceMarkerWrite: !remoteVersion,
        }).catch((error) =>
          console.error("Load master data from Supabase failed:", error),
        );
      },
      (error) => {
        handleSupabaseError(error, OperationType.GET, "app_cache/master_data");
      },
    );

    return () => {
      unsubMasterDataMarker();
    };
  }, [
    fetchMasterDataFromDb,
    isAuthReady,
    isAuthorizedUser,
    masterDataScope,
  ]);

  // Supabase Listeners
  useEffect(() => {
    if (!db || !isAuthReady || !isAuthorizedUser) return;

    // Saved Canvases
    const qSaved = query(
      collection(db, "canvases"),
      orderBy("createdAt", "desc"),
    );
    const unsubSaved = onSnapshot(
      qSaved,
      { includeMetadataChanges: true },
      (snapshot) => {
        const allCanvases = snapshot.docs
          .filter((doc) => !doc.metadata.hasPendingWrites)
          .map((doc) => ({ id: doc.id, ...doc.data() }) as SavedCanvas);
        // Filter in memory to avoid needing a composite index for type == 'saved' + orderBy('createdAt')
        setSavedCanvases(
          allCanvases.filter((c) => (c as any).type === "saved"),
        );
      },
      (error) => {
        handleSupabaseError(error, OperationType.GET, "canvases");
      },
    );

    return () => {
      unsubSaved();
    };
  }, [db, isAuthReady, isAuthorizedUser]);

  // Persistence Wrappers
  const updateCards = async (
    newCards: IChingCard[] | ((prev: IChingCard[]) => IChingCard[]),
  ) => {
    const nextCards =
      typeof newCards === "function" ? newCards(cardsRef.current) : newCards;
    cardsRef.current = nextCards;
    setCards(nextCards);
  };

  const updateGroups = async (
    newGroups: LabelGroup[] | ((prev: LabelGroup[]) => LabelGroup[]),
  ) => {
    const nextGroups =
      typeof newGroups === "function"
        ? newGroups(labelGroupsRef.current)
        : newGroups;
    labelGroupsRef.current = nextGroups;
    setLabelGroups(nextGroups);
  };

  const updateLabels = async (
    newLabels: Label[] | ((prev: Label[]) => Label[]),
  ) => {
    const nextLabels =
      typeof newLabels === "function"
        ? newLabels(labelsRef.current)
        : newLabels;
    labelsRef.current = nextLabels;
    setLabels(nextLabels);
  };

  const updateSpreadCards = async (
    newSpread: SpreadCard[] | ((prev: SpreadCard[]) => SpreadCard[]),
  ) => {
    const nextSpread =
      typeof newSpread === "function" ? newSpread(spreadCards) : newSpread;
    setSpreadCards(nextSpread);
  };

  const updateSavedCanvases = async (
    newSaved: SavedCanvas[] | ((prev: SavedCanvas[]) => SavedCanvas[]),
  ) => {
    const nextSaved =
      typeof newSaved === "function" ? newSaved(savedCanvases) : newSaved;
    setSavedCanvases(nextSaved);
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f8f9fa] gap-4">
        <div className="w-12 h-12 bg-[#166db0] rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-[#166db0]/20 text-2xl animate-pulse">
          ☯
        </div>
        <p className="text-sm font-bold text-[#495360] uppercase tracking-widest animate-pulse">
          Connecting to Supabase...
        </p>
      </div>
    );
  }

  if (!isAuthorizedUser) {
    return (
      <>
        <LoginGate />
        <Toaster position="bottom-right" theme="dark" duration={2000} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1b] font-sans selection:bg-[#166db0]/20">
      <div className="flex flex-col h-screen">
        {/* Top Bar */}
        <header className="h-16 border-b border-[#e2e8f0] bg-white flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex items-center justify-center group">
              <div className="absolute inset-0 bg-[#166db0]/10 rounded-xl blur-lg group-hover:bg-[#166db0]/20 transition-all duration-500" />
              <div className="relative w-10 h-10 bg-[#166db0] rounded-xl flex items-center justify-center shadow-lg shadow-[#166db0]/30 overflow-hidden">
                <svg
                  viewBox="0 0 100 100"
                  className="w-9 h-9 text-white fill-current transition-transform duration-700 group-hover:rotate-180"
                >
                  {/* Central Taiji */}
                  <circle cx="50" cy="50" r="15" className="opacity-90" />

                  {/* Bagua Trigrams (Stylized as 8 radiating bars) */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                    <g key={i} transform={`rotate(${angle} 50 50)`}>
                      {/* Each trigram represented by 3 lines */}
                      <rect x="46" y="15" width="8" height="3" rx="1.5" />
                      <rect x="46" y="22" width="8" height="3" rx="1.5" />
                      <rect x="46" y="29" width="8" height="3" rx="1.5" />
                    </g>
                  ))}

                  {/* Inner glow effect */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="opacity-20"
                  />
                </svg>

                {/* Modern overlay shine */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
              </div>
            </div>
            <h1 className="font-bold font-[Arial] w-auto h-[36px] text-[#000000] text-[19px] leading-[36px] whitespace-nowrap">
              Quantum iChing Manifestor
            </h1>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-auto h-10"
          >
            <TabsList className="bg-[#f1f5f9] p-1 rounded-xl border border-[#e2e8f0] h-10 group-data-horizontal/tabs:h-10 w-[510px] gap-1">
              <TabsTrigger
                value="iching-master"
                className="px-5 py-1.5 rounded-lg text-sm font-semibold text-[#495360] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm transition-all"
              >
                Deck Info
              </TabsTrigger>
              <TabsTrigger
                value="label-master"
                className="px-5 py-1.5 rounded-lg text-sm font-semibold text-[#495360] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm transition-all"
              >
                Label
              </TabsTrigger>
              <TabsTrigger
                value="drawing"
                className="px-5 py-1.5 rounded-lg text-sm font-semibold text-[#495360] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm transition-all"
              >
                Card Drawing
              </TabsTrigger>
              <TabsTrigger
                value="saved-canvases"
                className="px-5 py-1.5 rounded-lg text-sm font-semibold text-[#495360] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm transition-all"
              >
                Saved Canvas
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl border-[#e2e8f0] bg-white px-4 text-sm font-bold text-[#334155] hover:bg-[#f8fafc]"
              onClick={() => {
                void handleSignOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative">
          <Tabs value={activeTab} className="h-full flex flex-col">
            <TabsContent value="iching-master" className="flex-1 min-h-0 m-0">
              <MasterDataView
                cards={cards}
                setCards={updateCards}
                onSyncMasterData={handleSyncMasterData}
                isSyncingMasterData={isSyncingMasterData}
                onMasterDataWritten={handleMasterDataWritten}
              />
            </TabsContent>
            <TabsContent value="label-master" className="flex-1 min-h-0 m-0">
              <LabelMasterView
                groups={labelGroups}
                setGroups={updateGroups}
                labels={labels}
                setLabels={updateLabels}
                onSyncMasterData={handleSyncMasterData}
                isSyncingMasterData={isSyncingMasterData}
                onMasterDataWritten={handleMasterDataWritten}
              />
            </TabsContent>
            <TabsContent
              value="drawing"
              keepMounted
              className="flex-1 min-h-0 m-0"
            >
              <CardDrawingView
                cards={cards}
                spreadCards={spreadCards}
                setSpreadCards={updateSpreadCards}
                labels={labels}
                setLabels={updateLabels}
                labelGroups={labelGroups}
                setLabelGroups={updateGroups}
                user={user}
                loadCanvas={loadCanvas}
                onClearLoadCanvas={() => setLoadCanvas(null)}
                onMasterDataWritten={handleMasterDataWritten}
              />
            </TabsContent>
            <TabsContent value="saved-canvases" className="flex-1 min-h-0 m-0">
              <SavedCanvasesView
                savedCanvases={savedCanvases}
                setSavedCanvases={updateSavedCanvases}
                cards={allCards}
                labels={labels}
                onOpenCanvas={(canvas) => {
                  setLoadCanvas(canvas);
                  setActiveTab("drawing");
                }}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>
      <Toaster position="bottom-right" theme="dark" duration={2000} />
    </div>
  );
}
