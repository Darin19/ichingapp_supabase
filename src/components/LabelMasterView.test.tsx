import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LabelMasterView from "./LabelMasterView";

describe("LabelMasterView", () => {
  it("shows the number of labels belonging to each label group", () => {
    const markup = renderToStaticMarkup(
      <LabelMasterView
        groups={[
          { id: "target", name: "Target", sortOrder: 0 },
          { id: "status", name: "Status", sortOrder: 1 },
        ]}
        labels={[
          { id: "goal", name: "Goal", groupId: "target", sortOrder: 0 },
          { id: "outcome", name: "Outcome", groupId: "target", sortOrder: 1 },
          { id: "active", name: "Active", groupId: "status", sortOrder: 0 },
        ]}
        setGroups={() => undefined}
        setLabels={() => undefined}
        onSyncMasterData={() => undefined}
        isSyncingMasterData={false}
        onMasterDataWritten={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-label-group-count="true" aria-label="2 labels"',
    );
    expect(markup).toContain(
      'data-label-group-count="true" aria-label="1 label"',
    );
  });

  it("centers the empty label-group state in the labels area", () => {
    const markup = renderToStaticMarkup(
      <LabelMasterView
        groups={[{ id: "target", name: "Target", sortOrder: 0 }]}
        labels={[]}
        setGroups={() => undefined}
        setLabels={() => undefined}
        onSyncMasterData={() => undefined}
        isSyncingMasterData={false}
        onMasterDataWritten={() => undefined}
      />,
    );

    expect(markup).toContain(
      'data-label-group-empty-state="true" class="col-span-full flex min-h-full w-full flex-col items-center justify-center gap-4 text-center"',
    );
  });
});
