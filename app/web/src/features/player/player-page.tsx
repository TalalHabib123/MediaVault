import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { apiFetch } from "../../lib/api";
import type { PlayerContextResponse } from "../../types";
import {
  formatDuration,
  formatMediaTypeLong,
  formatResolution,
} from "../library/media-format";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [data, setData] = useState<PlayerContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vlcBusy, setVlcBusy] = useState(false);

  const returnTo = searchParams.get("return_to") || "/?tab=library";

  const load = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
      }

      if (event.key === "ArrowLeft") {
        video.currentTime = Math.max(video.currentTime - 10, 0);
      }

      if (event.key === "ArrowRight") {
        video.currentTime = Math.min(video.currentTime + 10, video.duration || 0);
      }

      if (event.key === "Escape") {
        navigate(returnTo);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, returnTo]);

  function goBackToSourcePage() {
    navigate(returnTo);
  }

  async function openInVLC() {
    if (!data) return;
    try {
      setVlcBusy(true);
      await apiFetch<{ ok: boolean }>(`/api/library/${data.item.id}/open-vlc`, {
        method: "POST",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in VLC");
    } finally {
      setVlcBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">MV</div>
          <h1 className="mt-5 text-3xl font-bold">Loading playback</h1>
          <p className="mt-3 text-sm text-(--text-secondary)">
            Preparing stream metadata and episode navigation.
          </p>
        </Card>
      </div>
    );
  }

  if (!data) {
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
    <div className="player-page">
      <div className="player-topbar">
        <div className="min-w-0">
          <Button onClick={goBackToSourcePage} variant="secondary" size="sm">
            Back
          </Button>
          <h1 className="mt-3 truncate text-2xl font-bold text-(--text-primary)">
            {item.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="default">{formatMediaTypeLong(item.media_type)}</Badge>
            <Badge variant="info">{formatDuration(item.duration_seconds)}</Badge>
            <Badge variant="accent">{formatResolution(item)}</Badge>
            {item.company_name ? (
              <Badge variant="success">{item.company_name}</Badge>
            ) : null}
            {item.media_type === "series_episode" &&
            item.season_number > 0 &&
            item.episode_number > 0 ? (
              <Badge variant="accent">
                S{String(item.season_number).padStart(2, "0")}E
                {String(item.episode_number).padStart(2, "0")}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              data.prev_episode_id &&
              navigate(
                `/player/${data.prev_episode_id}?return_to=${encodeURIComponent(returnTo)}`,
              )
            }
            disabled={!data.prev_episode_id}
            variant="outline"
            size="sm"
          >
            Previous
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
            size="sm"
          >
            Next
          </Button>
          <Button
            onClick={openInVLC}
            disabled={vlcBusy}
            variant="primary"
            size="sm"
          >
            {vlcBusy ? "Opening..." : "Open VLC"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mx-5 mt-5">
          {error}
        </Alert>
      ) : null}

      <main className="player-stage">
        <video
          ref={videoRef}
          key={item.id}
          src={`/api/library/${item.id}/stream`}
          controls
          autoPlay
          preload="metadata"
          className="h-full w-full object-contain"
        />
      </main>
    </div>
  );
}
