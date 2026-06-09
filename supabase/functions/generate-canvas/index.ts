import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FREEMODEL_API_KEY = Deno.env.get("FREEMODEL_API_KEY");
const FREEMODEL_BASE_URL =
  Deno.env.get("FREEMODEL_BASE_URL") || "https://api.freemodel.dev";
const FREEMODEL_MODEL = Deno.env.get("FREEMODEL_MODEL") || "gpt-5.5";
const FREEMODEL_REASONING_EFFORT =
  Deno.env.get("FREEMODEL_REASONING_EFFORT")?.trim() || "xhigh";
const AUTO_DRAW_CARD_LIMIT = 50;
const MODEL_CARD_CONTEXT_LIMIT = 180;
const MODEL_LABEL_CONTEXT_LIMIT = 240;
const MODEL_LABEL_GROUP_CONTEXT_LIMIT = 80;

type RequestBody = {
  scenario?: string;
  script?: string;
  cards?: unknown[];
  labels?: unknown[];
  labelGroups?: unknown[];
  deckTypes?: string[];
  // Legacy clients may still send this; model-decided card count ignores it.
  cardCount?: number;
};

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: corsHeaders,
  });

type FunctionResult = {
  body: unknown;
  status?: number;
};

const jsonResult = (body: unknown, status = 200): FunctionResult => ({
  body,
  status,
});

const truncate = (value: string, maxLength = 2400) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const getMaxCompletionTokens = () => 8_000;

const getFreemodelEndpointHost = () => {
  try {
    return new URL(FREEMODEL_BASE_URL).host;
  } catch {
    return FREEMODEL_BASE_URL.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
};

const buildFreemodelMeta = (elapsedMs?: number) => ({
  provider: "freemodel.dev",
  model: FREEMODEL_MODEL,
  reasoning_effort: FREEMODEL_REASONING_EFFORT,
  elapsed_ms: elapsedMs,
  endpoint_host: getFreemodelEndpointHost(),
  card_limit: AUTO_DRAW_CARD_LIMIT,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const asFiniteNumber = (value: unknown) => {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
};

type CompactCard = {
  id: string;
  card_type: string;
  number: unknown;
  vietnamese_name: string;
  english_name: string;
  keywords: string;
};

const SEARCH_STOP_WORDS = new Set([
  "anh",
  "can",
  "cua",
  "cho",
  "co",
  "dang",
  "du",
  "la",
  "mot",
  "nay",
  "nen",
  "nhung",
  "ra",
  "se",
  "theo",
  "thi",
  "trong",
  "va",
  "ve",
  "voi",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "the",
  "and",
  "for",
  "this",
  "that",
]);

const normalizeForSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const tokenizeForSearch = (value: string) =>
  normalizeForSearch(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token));

const addTerms = (target: Set<string>, terms: string[]) => {
  terms.forEach((term) => {
    tokenizeForSearch(term).forEach((token) => target.add(token));
  });
};

const addScenarioExpansions = (scenario: string, terms: Set<string>) => {
  const normalizedScenario = normalizeForSearch(scenario);
  const phraseExpansions: Array<{ pattern: RegExp; terms: string[] }> = [
    {
      pattern: /rui ro|nguy co|risk|danger|lo ngai|canh bao/,
      terms: [
        "risk",
        "danger",
        "obstruction",
        "conflict",
        "oppression",
        "tower",
        "swords",
        "abysmal",
        "canh giac",
        "tro ngai",
      ],
    },
    {
      pattern: /co hoi|thoi co|opportunit|potential|loi the/,
      terms: [
        "opportunity",
        "increase",
        "progress",
        "growth",
        "sun",
        "magician",
        "ace",
        "thuan loi",
        "phat trien",
      ],
    },
    {
      pattern: /doi huong|thay doi|chuyen huong|pivot|change|transform/,
      terms: [
        "change",
        "revolution",
        "transformation",
        "turning",
        "deliverance",
        "death",
        "wheel",
        "fool",
        "cai cach",
        "chuyen hoa",
      ],
    },
    {
      pattern: /buoc tiep|tiep theo|next step|hanh dong|duong di/,
      terms: [
        "next",
        "step",
        "guidance",
        "strategy",
        "hermit",
        "chariot",
        "waiting",
        "gradual",
        "development",
        "dinh huong",
      ],
    },
    {
      pattern: /du an|project|san pham|product|startup/,
      terms: [
        "project",
        "work",
        "foundation",
        "planning",
        "collaboration",
        "pentacles",
        "wands",
        "to chuc",
        "chien luoc",
      ],
    },
  ];

  phraseExpansions.forEach((expansion) => {
    if (expansion.pattern.test(normalizedScenario)) {
      addTerms(terms, expansion.terms);
    }
  });
};

const preferredCardIdsForScenario = (scenario: string) => {
  const normalizedScenario = normalizeForSearch(scenario);
  const preferred = new Set<string>();
  const add = (ids: string[]) => ids.forEach((id) => preferred.add(id));

  if (/rui ro|nguy co|risk|danger|lo ngai|canh bao/.test(normalizedScenario)) {
    add([
      "hexagram-6",
      "hexagram-29",
      "hexagram-39",
      "hexagram-47",
      "tarot-rws-tarot-16-tower",
      "tarot-rws-tarot-18-moon",
      "tarot-rws-tarot-15-devil",
      "tarot-swords07",
      "tarot-swords10",
    ]);
  }

  if (/co hoi|thoi co|opportunit|potential|loi the/.test(normalizedScenario)) {
    add([
      "hexagram-19",
      "hexagram-35",
      "hexagram-42",
      "hexagram-46",
      "tarot-rws-tarot-01-magician",
      "tarot-rws-tarot-19-sun",
      "tarot-wands01",
      "tarot-pents01",
    ]);
  }

  if (
    /doi huong|thay doi|chuyen huong|pivot|change|transform/.test(
      normalizedScenario,
    )
  ) {
    add([
      "hexagram-24",
      "hexagram-40",
      "hexagram-49",
      "hexagram-53",
      "tarot-rws-tarot-00-fool",
      "tarot-rws-tarot-10-wheel-of-fortune",
      "tarot-rws-tarot-13-death",
      "tarot-wands08",
    ]);
  }

  if (
    /buoc tiep|tiep theo|next step|hanh dong|duong di/.test(normalizedScenario)
  ) {
    add([
      "hexagram-3",
      "hexagram-5",
      "hexagram-57",
      "hexagram-60",
      "tarot-rws-tarot-07-chariot",
      "tarot-rws-tarot-09-hermit",
      "tarot-swords06",
      "tarot-pents03",
    ]);
  }

  return preferred;
};

const compactCardsPayload = (cards: unknown) => {
  if (!Array.isArray(cards)) return [];

  return cards
    .filter(isRecord)
    .map(
      (card): CompactCard => ({
        id: asString(card.id),
        card_type: asString(card.card_type),
        number: card.number,
        vietnamese_name: asString(card.vietnamese_name),
        english_name: asString(card.english_name),
        keywords: asString(card.keywords).slice(0, 240),
      }),
    )
    .filter((card) => card.id);
};

const selectCandidateCards = (
  cards: CompactCard[],
  scenario: string,
  deckTypes: string[],
) => {
  const allowedDeckTypes = new Set(
    deckTypes.length ? deckTypes : ["iching", "tarot"],
  );
  const filteredCards = cards.filter((card) =>
    allowedDeckTypes.has(card.card_type),
  );
  const preferredIds = preferredCardIdsForScenario(scenario);
  const queryTerms = new Set(tokenizeForSearch(scenario));
  addScenarioExpansions(scenario, queryTerms);

  const scoredCards = filteredCards.map((card, index) => {
    const nameText = normalizeForSearch(
      `${card.vietnamese_name} ${card.english_name}`,
    );
    const keywordText = normalizeForSearch(card.keywords);
    const fullText = `${card.id} ${card.card_type} ${card.number ?? ""} ${nameText} ${keywordText}`;
    let score = preferredIds.has(card.id) ? 18 : 0;

    queryTerms.forEach((term) => {
      if (nameText.includes(term)) score += 6;
      if (keywordText.includes(term)) score += 4;
      if (fullText.includes(term)) score += 1;
    });

    return { card, index, score };
  });

  const sortedCards = scoredCards.sort(
    (a, b) => b.score - a.score || a.index - b.index,
  );
  const candidateLimit = Math.min(
    filteredCards.length,
    MODEL_CARD_CONTEXT_LIMIT,
  );
  const selectedById = new Set<string>();
  const selected: typeof sortedCards = [];
  const allowedDeckOrder = Array.from(allowedDeckTypes);

  if (allowedDeckOrder.length > 1) {
    const minimumPerDeck = Math.max(5, Math.floor(candidateLimit * 0.25));
    allowedDeckOrder.forEach((deckType) => {
      sortedCards
        .filter(({ card }) => card.card_type === deckType)
        .slice(0, minimumPerDeck)
        .forEach((item) => {
          if (
            selected.length >= candidateLimit ||
            selectedById.has(item.card.id)
          ) {
            return;
          }
          selectedById.add(item.card.id);
          selected.push(item);
        });
    });
  }

  sortedCards.forEach((item) => {
    if (selected.length >= candidateLimit || selectedById.has(item.card.id)) {
      return;
    }
    selectedById.add(item.card.id);
    selected.push(item);
  });

  return selected.map(({ card }) => ({
    id: card.id,
    card_type: card.card_type,
    number: card.number,
    vietnamese_name: card.vietnamese_name,
    english_name: card.english_name,
  }));
};

const compactLabelsPayload = (labels: unknown) => {
  if (!Array.isArray(labels)) return [];

  return labels
    .filter(isRecord)
    .map((label) => ({
      id: asString(label.id),
      name: asString(label.name),
      group_id: asString(label.group_id),
      group: asString(label.group),
    }))
    .filter((label) => label.id || label.name)
    .slice(0, MODEL_LABEL_CONTEXT_LIMIT);
};

const compactLabelGroupsPayload = (labelGroups: unknown) => {
  if (!Array.isArray(labelGroups)) return [];

  return labelGroups
    .filter(isRecord)
    .map((group) => ({
      id: asString(group.id),
      name: asString(group.name),
    }))
    .filter((group) => group.id || group.name)
    .slice(0, MODEL_LABEL_GROUP_CONTEXT_LIMIT);
};

const validateModelCanvas = (
  parsed: Record<string, unknown>,
  cards: CompactCard[],
) => {
  const knownCardIds = new Set(cards.map((card) => card.id));
  const responseCards = Array.isArray(parsed.cards) ? parsed.cards : [];

  if (responseCards.length === 0) {
    return jsonResult({ error: "Model returned no cards" }, 500);
  }

  if (responseCards.length > AUTO_DRAW_CARD_LIMIT) {
    return jsonResult(
      {
        error: "Model returned too many cards",
        detail: `Expected at most ${AUTO_DRAW_CARD_LIMIT}, received ${responseCards.length}`,
      },
      500,
    );
  }

  const seenCardIds = new Set<string>();
  const duplicateCardIds = new Set<string>();
  const unknownCardIds = new Set<string>();

  responseCards.forEach((card) => {
    const cardId = isRecord(card) ? asString(card.card_id) : "";
    if (!cardId || !knownCardIds.has(cardId))
      unknownCardIds.add(cardId || "(missing)");
    if (seenCardIds.has(cardId)) duplicateCardIds.add(cardId);
    seenCardIds.add(cardId);
  });

  if (unknownCardIds.size > 0) {
    return jsonResult(
      {
        error: "Model returned unknown card IDs",
        detail: Array.from(unknownCardIds).join(", "),
      },
      500,
    );
  }

  if (duplicateCardIds.size > 0) {
    return jsonResult(
      {
        error: "Model returned duplicate card IDs",
        detail: Array.from(duplicateCardIds).join(", "),
      },
      500,
    );
  }

  if (parsed.canvas_nodes !== undefined) {
    if (!Array.isArray(parsed.canvas_nodes)) {
      return jsonResult({ error: "Model canvas_nodes must be an array" }, 500);
    }

    const cardNodes = parsed.canvas_nodes.filter(
      (node) => isRecord(node) && node.type === "card",
    );

    if (cardNodes.length !== responseCards.length) {
      return jsonResult(
        {
          error: "Model returned mismatched canvas nodes",
          detail: `Expected ${responseCards.length} card nodes, received ${cardNodes.length}`,
        },
        500,
      );
    }

    const seenNodeRefs = new Set<string>();
    const invalidNodeRefs = new Set<string>();
    const duplicateNodeRefs = new Set<string>();

    cardNodes.forEach((node) => {
      const refId = asString((node as Record<string, unknown>).ref_id);
      if (!seenCardIds.has(refId)) invalidNodeRefs.add(refId || "(missing)");
      if (seenNodeRefs.has(refId)) duplicateNodeRefs.add(refId);
      seenNodeRefs.add(refId);
    });

    if (invalidNodeRefs.size > 0) {
      return jsonResult(
        {
          error: "Model returned invalid canvas node refs",
          detail: Array.from(invalidNodeRefs).join(", "),
        },
        500,
      );
    }

    if (duplicateNodeRefs.size > 0) {
      return jsonResult(
        {
          error: "Model returned duplicate canvas node refs",
          detail: Array.from(duplicateNodeRefs).join(", "),
        },
        500,
      );
    }
  }

  return null;
};

const normalizeModelCanvas = (
  parsed: Record<string, unknown>,
  cards: CompactCard[],
) => {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const responseCards = Array.isArray(parsed.cards) ? parsed.cards : [];

  return {
    ...parsed,
    cards: responseCards.filter(isRecord).map((card, index) => {
      const cardId = asString(card.card_id);
      const knownCard = cardById.get(cardId);
      const deckType = knownCard?.card_type || asString(card.card_type);
      const drawOrder = asFiniteNumber(card.draw_order) || index + 1;
      const normalized: Record<string, unknown> = {
        ...card,
        card_id: cardId,
        card_type: deckType,
        name:
          asString(card.name) ||
          [knownCard?.vietnamese_name, knownCard?.english_name]
            .filter(Boolean)
            .join(" / "),
        draw_order: drawOrder,
      };

      if (deckType === "tarot") {
        normalized.orientation =
          asString(card.orientation).toLowerCase() === "reversed"
            ? "reversed"
            : "upright";
        delete normalized.effect;
      }

      if (deckType === "iching") {
        const effect = asString(card.effect).toLowerCase();
        normalized.effect =
          effect === "positive" || effect === "negative" || effect === "neutral"
            ? effect
            : "neutral";
        delete normalized.orientation;
      }

      return normalized;
    }),
  };
};

const streamDeferredJsonResponse = (resultPromise: Promise<FunctionResult>) => {
  const encoder = new TextEncoder();
  let heartbeatId: number | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(" "));
      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode("\n"));
      }, 15_000);

      resultPromise
        .then((result) => {
          if (heartbeatId) clearInterval(heartbeatId);
          controller.enqueue(encoder.encode(JSON.stringify(result.body)));
          controller.close();
        })
        .catch((err) => {
          if (heartbeatId) clearInterval(heartbeatId);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                error: "Internal server error",
                detail: truncate(String(err)),
              }),
            ),
          );
          controller.close();
        });
    },
    cancel() {
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

const resolveWithStreamingFallback = async (
  resultPromise: Promise<FunctionResult>,
) => {
  const quickResult = await Promise.race<
    { type: "result"; result: FunctionResult } | { type: "stream" }
  >([
    resultPromise.then((result) => ({ type: "result", result })),
    new Promise<{ type: "stream" }>((resolve) => {
      setTimeout(() => resolve({ type: "stream" }), 20_000);
    }),
  ]);

  if (quickResult.type === "result") {
    return jsonResponse(quickResult.result.body, quickResult.result.status);
  }

  return streamDeferredJsonResponse(resultPromise);
};

const systemPrompt = `Return JSON only for an iChing/Tarot canvas.
Use script as the authoritative source. Scenario is optional supporting context.
If script names specific cards, positions, labels, orientations, or effects, preserve them and resolve them to cards[].id exactly. Never invent card IDs.
Choose 1 to card_limit cards from cards. Prefer the exact script cards over thematic guessing; never pad with unrelated cards.
Return structure only. Do not write an interpretation or explanation; set scenario_summary to "", themes to [], and note_markdown to "" because the client saves the script as the note.
For tarot cards, orientation must be "upright" or "reversed". For iChing cards, effect must be "positive", "negative", or "neutral".
Use cached labels when possible: copy labels[].id into label_id or canvas_nodes[].label_ids. Create new labels only when the script clearly needs them; use group "Auto-Draw" if no existing group fits.
Every card must have one canvas_nodes entry with type "card", matching ref_id, and x/y coordinates for the canvas layout.
Shape: {"scenario_summary":"","themes":[],"note_markdown":"","cards":[{"card_id":"","card_type":"iching|tarot","name":"","draw_order":1,"orientation":"upright|reversed","effect":"positive|negative|neutral","position":"","reason":"","match_score":0.0}],"labels":[{"label_id":"","group":"","name":"","attach_to_card_ids":[]}],"canvas_nodes":[{"id":"","type":"card","ref_id":"","x":0,"y":0,"label_ids":[]}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const scenario = body.scenario?.trim() || "";
    const script = body.script?.trim() || "";
    const sourceText = [script, scenario].filter(Boolean).join("\n\n");

    if (!sourceText) {
      return jsonResponse({ error: "Missing scenario or script" }, 400);
    }

    if (!FREEMODEL_API_KEY) {
      return jsonResponse({ error: "Missing FREEMODEL_API_KEY" }, 500);
    }

    const deckTypes = body.deckTypes ?? ["iching", "tarot"];
    const allCompactCards = compactCardsPayload(body.cards);
    const candidateCards = selectCandidateCards(
      allCompactCards,
      sourceText,
      deckTypes,
    );
    const cachedLabels = compactLabelsPayload(body.labels);
    const cachedLabelGroups = compactLabelGroupsPayload(body.labelGroups);

    if (candidateCards.length === 0) {
      return jsonResponse({ error: "Missing cards" }, 400);
    }

    const userPrompt = {
      ...(scenario ? { scenario } : {}),
      ...(script ? { script } : {}),
      source: script || scenario,
      deckTypes,
      card_limit: AUTO_DRAW_CARD_LIMIT,
      cards: candidateCards,
      labels: cachedLabels,
      labelGroups: cachedLabelGroups,
    };

    const requestBody: Record<string, unknown> = {
      model: FREEMODEL_MODEL,
      temperature: 0.4,
      max_completion_tokens: getMaxCompletionTokens(),
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(userPrompt),
        },
      ],
      response_format: {
        type: "json_object",
      },
    };

    if (FREEMODEL_REASONING_EFFORT) {
      requestBody.reasoning_effort = FREEMODEL_REASONING_EFFORT;
    }

    const freemodelResultPromise = (async (): Promise<FunctionResult> => {
      const startedAt = Date.now();
      const freemodelRes = await fetch(
        `${FREEMODEL_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FREEMODEL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!freemodelRes.ok) {
        const errorText = await freemodelRes.text();
        const elapsedMs = Date.now() - startedAt;
        return jsonResult(
          {
            error: "Freemodel API error",
            detail: truncate(errorText),
            _meta: buildFreemodelMeta(elapsedMs),
          },
          freemodelRes.status,
        );
      }

      const result = await freemodelRes.json();
      const elapsedMs = Date.now() - startedAt;
      const content = result?.choices?.[0]?.message?.content;

      if (!content) {
        return jsonResult(
          {
            error: "Empty model response",
            raw: result,
            _meta: buildFreemodelMeta(elapsedMs),
          },
          500,
        );
      }

      let parsed: unknown;
      try {
        parsed = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        return jsonResult(
          {
            error: "Model did not return valid JSON",
            raw: truncate(String(content)),
            _meta: buildFreemodelMeta(elapsedMs),
          },
          500,
        );
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonResult(
          {
            error: "Model JSON must be an object",
            _meta: buildFreemodelMeta(elapsedMs),
          },
          500,
        );
      }

      const validationError = validateModelCanvas(
        parsed as Record<string, unknown>,
        allCompactCards,
      );
      if (validationError) {
        return {
          body: {
            ...(validationError.body as Record<string, unknown>),
            _meta: buildFreemodelMeta(elapsedMs),
          },
          status: validationError.status,
        };
      }

      const normalizedCanvas = normalizeModelCanvas(
        parsed as Record<string, unknown>,
        allCompactCards,
      );

      return jsonResult({
        ...normalizedCanvas,
        _meta: buildFreemodelMeta(elapsedMs),
      });
    })();

    return await resolveWithStreamingFallback(freemodelResultPromise);
  } catch (err) {
    return jsonResponse(
      {
        error: "Internal server error",
        detail: truncate(String(err)),
      },
      500,
    );
  }
});
