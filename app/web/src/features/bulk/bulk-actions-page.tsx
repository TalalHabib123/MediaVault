import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import type { MediaItem } from "../../types";
import {
  formatDuration,
  formatMediaTypeLong,
  formatResolution,
} from "../library/media-format";

type Props = {
  items: MediaItem[];
  selectedIds: number[];
  onClearSelection: () => void;
  onOpenBulkTagging: () => void;
  onBulkMove: () => void;
  bulkMoving: boolean;
  onOpenItem: (id: number) => void;
  onOpenPlayer: (id: number) => void;
};

export function BulkActionsPage({
  items,
  selectedIds,
  onClearSelection,
  onOpenBulkTagging,
  onBulkMove,
  bulkMoving,
  onOpenItem,
  onOpenPlayer,
}: Props) {
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  return (
    <div className="grid gap-6">
      <section className="media-hero compact">
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-(--text-primary)">
            Bulk action review
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-(--text-secondary)">
            Review the current selection before applying metadata changes,
            managed moves, or preview rebuilds. Destructive cleanup remains
            isolated inside each item detail drawer.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Badge variant={selectedItems.length > 0 ? "success" : "warning"}>
              {selectedItems.length} selected
            </Badge>
            <Button
              variant="primary"
              onClick={onOpenBulkTagging}
              disabled={selectedItems.length === 0}
            >
              Bulk Tag
            </Button>
            <Button
              variant="secondary"
              onClick={onBulkMove}
              disabled={selectedItems.length === 0 || bulkMoving}
            >
              {bulkMoving ? "Moving..." : "Move To Library"}
            </Button>
            <Button
              variant="ghost"
              onClick={onClearSelection}
              disabled={selectedItems.length === 0}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      </section>

      <Card className="p-5">
        <CardHeader
          title="Selected Media"
          description="This list is populated from Library grid and table selections."
        />
        <CardContent>
          {selectedItems.length === 0 ? (
            <div className="empty-state">
              Select items from the Library page before running a bulk action.
            </div>
          ) : (
            <div className="grid gap-3">
              {selectedItems.map((item) => (
                <div key={item.id} className="bulk-row">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-(--text-primary)">
                      {item.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-(--text-secondary)">
                      <span>{formatMediaTypeLong(item.media_type)}</span>
                      <span>{formatDuration(item.duration_seconds)}</span>
                      <span>{formatResolution(item)}</span>
                      {item.company_name ? <span>{item.company_name}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onOpenPlayer(item.id)}
                    >
                      Play
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenItem(item.id)}
                    >
                      Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
