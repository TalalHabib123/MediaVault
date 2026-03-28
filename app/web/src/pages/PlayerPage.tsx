export { PlayerPage as default } from "../features/player/player-page";

/* Legacy page retained during redesign extraction.
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import type { PlayerContextResponse } from "../types";

export default function PlayerPage() {
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

      const response = await apiFetch<PlayerContextResponse>(`/api/library/${id}/player-context`);
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
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        Loading player...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <button
            onClick={goBackToSourcePage}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Back
          </button>

          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error || "Player data not found."}
          </div>
        </div>
      </div>
    );
  }

  const item = data.item;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={goBackToSourcePage}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Back
          </button>

          <div className="flex gap-2">
            <button
              onClick={() =>
                data.prev_episode_id &&
                navigate(`/player/${data.prev_episode_id}?return_to=${encodeURIComponent(returnTo)}`)
              }
              disabled={!data.prev_episode_id}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Previous Episode
            </button>

            <button
              onClick={() =>
                data.next_episode_id &&
                navigate(`/player/${data.next_episode_id}?return_to=${encodeURIComponent(returnTo)}`)
              }
              disabled={!data.next_episode_id}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Next Episode
            </button>
          </div>
        </div>

        <div className="mt-6">
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-400">
            <span>{item.media_type === "series_episode" ? "Series Episode" : item.media_type}</span>
            {item.series_name ? <span>• {item.series_name}</span> : null}
            {item.media_type === "series_episode" && item.season_number > 0 && item.episode_number > 0 ? (
              <span>
                • S{String(item.season_number).padStart(2, "0")}E{String(item.episode_number).padStart(2, "0")}
              </span>
            ) : null}
            {item.company_name ? <span>• {item.company_name}</span> : null}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="w-full max-w-5xl aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl">
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
*/
