import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { apiFetch } from "../../lib/api";
import type { PlaybackStatus, PlayerContextResponse } from "../../types";
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
  const prewarmedForRef = useRef<number | null>(null);

  const [data, setData] = useState<PlayerContextResponse | null>(null);
  const [playback, setPlayback] = useState<PlaybackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vlcBusy, setVlcBusy] = useState(false);

  const returnTo = searchParams.get("return_to") || "/?tab=library";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setData(null);
      setPlayback(null);
      const response = await apiFetch<PlayerContextResponse>(
        `/api/library/${id}/player-context`,
      );
      setData(response);
      setPlayback(response.playback);
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
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(video.currentTime + 10, duration);
      }

      if (event.key === "Escape") {
        navigate(returnTo);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, returnTo]);

  useEffect(() => {
    if (!data || !playback || playback.status !== "preparing") return;

    const mediaID = data.item.id;
    let canceled = false;
    let timer: number | undefined;

    async function pollPlayback() {
      try {
        const next = await apiFetch<PlaybackStatus>(
          `/api/library/${mediaID}/playback/status?mode=auto`,
        );
        if (canceled) return;
        setPlayback(next);
        if (next.status === "preparing") {
          timer = window.setTimeout(pollPlayback, 2000);
        }
      } catch (err) {
        if (!canceled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to prepare playback",
          );
        }
      }
    }

    timer = window.setTimeout(pollPlayback, 1200);
    return () => {
      canceled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [data, playback]);

  useEffect(() => {
    if (!data || playback?.status !== "ready") return;
    if (prewarmedForRef.current === data.item.id) return;
    prewarmedForRef.current = data.item.id;

    const adjacentIDs = [data.prev_episode_id, data.next_episode_id].filter(
      (value): value is number => typeof value === "number" && value > 0,
    );
    for (const adjacentID of adjacentIDs) {
      void apiFetch<PlaybackStatus>(
        `/api/library/${adjacentID}/playback/status?mode=auto`,
      ).catch(() => {});
    }
  }, [data, playback?.status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playback?.status !== "ready" || playback.mode !== "hls") {
      return;
    }

    const manifestURL = playback.hls_manifest_url;
    if (!manifestURL) return;

    let canceled = false;
    let hls: import("hls.js").default | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = manifestURL;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (canceled) return;
        if (!Hls.isSupported()) {
          setError("This browser cannot play the prepared HLS stream.");
          return;
        }
        hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
        });
        hls.loadSource(manifestURL);
        hls.attachMedia(video);
      })
      .catch((err) => {
        if (!canceled) {
          setError(
            err instanceof Error ? err.message : "Failed to load HLS player",
          );
        }
      });

    return () => {
      canceled = true;
      hls?.destroy();
    };
  }, [playback?.hls_manifest_url, playback?.mode, playback?.status]);

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
  const playbackReady = playback?.status === "ready";
  const videoSource =
    playbackReady && playback?.mode !== "hls" ? playback.stream_url : undefined;

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
        {playbackReady ? (
          <video
            ref={videoRef}
            key={`${item.id}-${playback.mode}-${videoSource ?? playback.hls_manifest_url}`}
            src={videoSource}
            controls
            autoPlay
            preload="auto"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="player-preparing" role="status">
            <div className="brand-mark">MV</div>
            <h2>
              {playback?.status === "error"
                ? "Playback preparation failed"
                : "Preparing playback"}
            </h2>
            <p>
              {playback?.message ||
                "Creating a seekable stream for this video."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
