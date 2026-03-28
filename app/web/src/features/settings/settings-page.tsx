import type { Dispatch, SetStateAction } from "react";
import type { AppConfig } from "../../types";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

type Props = {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  onSave: () => void;
  saving: boolean;
  newSource: string;
  setNewSource: (value: string) => void;
  addSource: () => void;
  removeSource: (index: number) => void;
};

export function SettingsPage(props: Props) {
  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <CardHeader
          title="Source Directories"
          description="These folders are scanned recursively for supported video files."
        />
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={props.newSource}
              onChange={(event) => props.setNewSource(event.target.value)}
              placeholder="E:\\Movies"
              className="flex-1"
            />
            <Button variant="primary" onClick={props.addSource}>
              Add Source
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {props.config.paths.sources.length === 0 ? (
              <div className="empty-state">No source folders added yet.</div>
            ) : (
              props.config.paths.sources.map((src, index) => (
                <div
                  key={`${src}-${index}`}
                  className="surface-muted flex items-center justify-between gap-3 rounded-[1rem] px-4 py-3"
                >
                  <span className="break-all text-sm">{src}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.removeSource(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Path Configuration"
          description="Update the local roots used for managed files, views, and previews."
        />
        <CardContent className="grid gap-4">
          <SettingsField
            label="Library Root"
            value={props.config.paths.library_root}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, library_root: value },
              }))
            }
          />
          <SettingsField
            label="Views Root"
            value={props.config.paths.views_root}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, views_root: value },
              }))
            }
          />
          <SettingsField
            label="Preview Cache"
            value={props.config.paths.preview_cache}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, preview_cache: value },
              }))
            }
          />
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="External Tools"
          description="Point MediaVault to the binaries it uses during scanning, previews, and playback."
        />
        <CardContent className="grid gap-4">
          <SettingsField
            label="FFmpeg Path"
            value={props.config.tools.ffmpeg}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, ffmpeg: value },
              }))
            }
          />
          <SettingsField
            label="FFprobe Path"
            value={props.config.tools.ffprobe}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, ffprobe: value },
              }))
            }
          />
          <SettingsField
            label="VLC Path (vlc.exe)"
            value={props.config.tools.vlc}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, vlc: value },
              }))
            }
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="lg"
          onClick={props.onSave}
          disabled={props.saving}
        >
          {props.saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

function SettingsField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
        {props.label}
      </span>
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
