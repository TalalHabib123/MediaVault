import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { apiFetch } from "../../lib/api";
import type { PlayerContextResponse } from "../../types";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<PlayerContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const returnTo = searchParams.get("return_to") || "/?tab=library";

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const response = await apiFetch<PlayerContextResponse>(
        `/api/library/${id}/player-context`,
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    } finally {
      setLoading(false);
    }
  }

  function goBackToSourcePage() {
    navigate(returnTo);
  }

  if (loading) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg p-8 text-center">
          <div className="page-kicker">Player</div>
          <h1 className="brand-title mt-3 text-3xl">
            Loading playback context
          </h1>
          <p className="mt-3 text-sm text-(--text-muted)">
            Preparing stream metadata and episode navigation.
          </p>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-frame min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Button onClick={goBackToSourcePage} variant="secondary">
            Back
          </Button>
          <Alert tone="danger" className="mt-6">
            {error || "Player data not found."}
          </Alert>
        </div>
      </div>
    );
  }

  const item = data.item;

  return (
    <div className="app-frame min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Card className="overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(224,178,92,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(78,120,171,0.12),transparent_30%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button onClick={goBackToSourcePage} variant="secondary">
                Back
              </Button>

              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    data.prev_episode_id &&
                    navigate(
                      `/player/${data.prev_episode_id}?return_to=${encodeURIComponent(returnTo)}`,
                    )
                  }
                  disabled={!data.prev_episode_id}
                  variant="outline"
                >
                  Previous Episode
                </Button>

                <Button
                  onClick={() =>
                    data.next_episode_id &&
                    navigate(
                      `/player/${data.next_episode_id}?return_to=${encodeURIComponent(returnTo)}`,
                    )
                  }
                  disabled={!data.next_episode_id}
                  variant="outline"
                >
                  Next Episode
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <div className="page-kicker">Playback</div>
              <h1 className="brand-title mt-2 text-4xl">{item.title}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="default">
                  {item.media_type === "series_episode"
                    ? "Series Episode"
                    : item.media_type}
                </Badge>
                {item.series_name ? (
                  <Badge variant="info">{item.series_name}</Badge>
                ) : null}
                {item.media_type === "series_episode" &&
                item.season_number > 0 &&
                item.episode_number > 0 ? (
                  <Badge variant="accent">
                    S{String(item.season_number).padStart(2, "0")}E
                    {String(item.episode_number).padStart(2, "0")}
                  </Badge>
                ) : null}
                {item.company_name ? (
                  <Badge variant="success">{item.company_name}</Badge>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 flex justify-center">
          <div className="w-full max-w-9xl aspect-video overflow-hidden rounded-[1.8rem] border border-(--border-strong) bg-black shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
            <video
              key={item.id}
              src={`/api/library/${item.id}/stream`}
              controls
              autoPlay
              preload="metadata"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
