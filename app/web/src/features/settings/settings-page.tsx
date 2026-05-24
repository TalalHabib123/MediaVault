import type { Dispatch, SetStateAction } from "react";
import type { AppConfig } from "../../types";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
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
      <section className="media-hero compact">
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-(--text-primary)">
            Settings that keep the vault predictable
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-(--text-secondary)">
            Configure local source paths, managed library roots, preview cache,
            and playback tools. Dangerous file behavior stays explicit and
            host-bound.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant={props.config.mode.portable ? "info" : "default"}>
              {props.config.mode.portable ? "Portable mode" : "Installed mode"}
            </Badge>
            <Badge variant="success">Local-first</Badge>
          </div>
        </div>
      </section>

      <Card className="p-5">
        <CardHeader
          title="Library Sources"
          description="These folders are scanned recursively. MediaVault stores references instead of duplicating source files."
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
                  className="source-row"
                  title={src}
                >
                  <span>{src}</span>
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

      <section className="grid gap-6 xl:grid-cols-2">
        <SettingsPanel
          title="Managed Library"
          description="Destination roots for organized media and generated views."
        >
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
        </SettingsPanel>

        <SettingsPanel
          title="Preview Cache"
          description="Generated thumbnails and hover previews are stored here."
        >
          <SettingsField
            label="Preview Cache Path"
            value={props.config.paths.preview_cache}
            onChange={(value) =>
              props.setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, preview_cache: value },
              }))
            }
          />
          <Alert tone="info">
            Preview rebuilds are available from Scanner and Library. Cache
            clearing can be added once the backend exposes a dedicated endpoint.
          </Alert>
        </SettingsPanel>

        <SettingsPanel
          title="Playback"
          description="Browser playback streams through MediaVault. VLC opens only on the host machine."
        >
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
          <Alert tone="warning">
            Remote LAN clients should use browser playback. Host VLC launch is
            intentionally not treated as a remote capability.
          </Alert>
        </SettingsPanel>

        <SettingsPanel
          title="Media Tools"
          description="FFmpeg and FFprobe power metadata extraction and preview generation."
        >
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
        </SettingsPanel>
      </section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="surface-card p-2">
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
    </div>
  );
}

function SettingsPanel(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <CardHeader title={props.title} description={props.description} />
      <CardContent className="grid gap-4">{props.children}</CardContent>
    </Card>
  );
}

function SettingsField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="field-caption">{props.label}</span>
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
