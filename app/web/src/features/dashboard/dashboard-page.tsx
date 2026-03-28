import { Alert } from "../../components/ui/alert";
import { DashboardShell } from "../../app/layout/dashboard-shell";
import { NotificationDock } from "../../app/layout/notification-dock";
import { BulkTagDrawer } from "../library/bulk-tag-drawer";
import { LibraryPage } from "../library/library-page";
import { MediaDetailDrawer } from "../library/media-detail-drawer";
import { MetadataPage } from "../metadata/metadata-page";
import { MoveJobNotification } from "../notifications/move-job-notification";
import { PreviewJobNotification } from "../notifications/preview-job-notification";
import { TaggedSearchPage } from "../search/tagged-search-page";
import { SettingsPage } from "../settings/settings-page";
import { getDashboardTabMeta } from "./dashboard-tabs";
import { useDashboardController } from "./use-dashboard-controller";

export function DashboardPage() {
  const controller = useDashboardController();
  const tabMeta = getDashboardTabMeta(controller.activeTab);
  const statusBadges = [
    controller.previewJob?.status === "running" ? "Preview Job Running" : "",
    controller.moveJob?.status === "running" ? "Move Job Running" : "",
    controller.selectedIds.length > 0
      ? `${controller.selectedIds.length} Selected`
      : "",
  ].filter(Boolean);

  if (controller.configLoading || controller.optionsLoading) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-6">
        <div className="surface-card max-w-lg p-8 text-center">
          <div className="page-kicker">Initializing</div>
          <h1 className="brand-title mt-3 text-3xl">Loading MediaVault</h1>
          <p className="mt-3 text-sm text-(--text-muted)">
            Preparing the local vault, metadata options, and dashboard state.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      activeTab={controller.activeTab}
      onTabChange={controller.setActiveTab}
      eyebrow={tabMeta.eyebrow}
      title={tabMeta.title}
      description={tabMeta.description}
      statusBadges={statusBadges}
      alerts={
        <div className="grid gap-3">
          {controller.error ? (
            <Alert tone="danger" title="Something needs attention">
              {controller.error}
            </Alert>
          ) : null}

          {controller.message ? (
            <Alert tone="success" title="Latest update">
              {controller.message}
            </Alert>
          ) : null}
        </div>
      }
      notifications={
        (controller.moveJob &&
          controller.dismissedMoveJobId !== controller.moveJob.id) ||
        (controller.previewJob &&
          controller.dismissedPreviewJobId !== controller.previewJob.id) ? (
          <NotificationDock>
            {controller.moveJob &&
            controller.dismissedMoveJobId !== controller.moveJob.id ? (
              <MoveJobNotification
                job={controller.moveJob}
                onDismiss={() =>
                  controller.setDismissedMoveJobId(controller.moveJob!.id)
                }
              />
            ) : null}

            {controller.previewJob &&
            controller.dismissedPreviewJobId !== controller.previewJob.id ? (
              <PreviewJobNotification
                job={controller.previewJob}
                onDismiss={() =>
                  controller.setDismissedPreviewJobId(controller.previewJob!.id)
                }
              />
            ) : null}
          </NotificationDock>
        ) : null
      }
    >
      {controller.activeTab === "library" ? (
        <LibraryPage
          items={controller.visibleItems}
          total={controller.libraryTotal}
          previewAssetVersion={controller.previewAssetVersion}
          mediaType={controller.mediaTypeFilter}
          taggedStatus={controller.taggedStatusFilter}
          onMediaTypeChange={controller.setLibraryMediaType}
          onTaggedStatusChange={controller.setLibraryTaggedStatus}
          search={controller.librarySearch}
          onSearchChange={controller.setLibrarySearch}
          loading={controller.libraryLoading}
          onRefresh={controller.loadLibrary}
          onScan={controller.runScan}
          scanLoading={controller.scanLoading}
          scanSummary={controller.scanSummary}
          hasSources={controller.config.paths.sources.length > 0}
          onOpenItem={controller.openItem}
          onOpenPlayer={controller.openPlayer}
          selectedIds={controller.selectedIds}
          onToggleSelected={controller.toggleSelected}
          onClearSelection={controller.clearSelection}
          onOpenBulkTagging={() => controller.setBulkTagOpen(true)}
          onBulkMove={controller.bulkMoveSelected}
          bulkMoving={
            controller.bulkMoving || controller.moveJob?.status === "running"
          }
          onRegenThumbnails={() =>
            void controller.startPreviewRegeneration("thumbnails")
          }
          onRegenHovers={() =>
            void controller.startPreviewRegeneration("hovers")
          }
          previewBusy={controller.previewJob?.status === "running"}
          selectedCount={controller.selectedIds.length}
        />
      ) : controller.activeTab === "search" ? (
        <TaggedSearchPage
          options={controller.options}
          previewAssetVersion={controller.previewAssetVersion}
          onOpenPlayer={controller.openPlayer}
          onOpenVLC={controller.openInVLCById}
          onEditTag={controller.openItem}
        />
      ) : controller.activeTab === "metadata" ? (
        <MetadataPage
          options={controller.options}
          onCreateCompany={controller.createCompany}
          onCreatePerson={controller.createPerson}
          onCreateCategory={controller.createCategory}
          onCreateTag={controller.createTag}
          onCreateSeries={controller.createSeries}
        />
      ) : (
        <SettingsPage
          config={controller.config}
          setConfig={controller.setConfig}
          onSave={controller.saveSettings}
          saving={controller.configSaving}
          newSource={controller.newSource}
          setNewSource={controller.setNewSource}
          addSource={controller.addSource}
          removeSource={controller.removeSource}
        />
      )}

      <MediaDetailDrawer
        detail={controller.selectedDetail}
        options={controller.options}
        savingDetails={controller.detailSaving}
        savingTagging={controller.taggingSaving}
        moving={controller.moving || controller.moveJob?.status === "running"}
        deleting={controller.deleting}
        toolActionBusy={controller.toolActionBusy}
        onClose={() => controller.setSelectedDetail(null)}
        onSaveDetails={controller.saveItem}
        onSaveTagging={controller.saveTagging}
        onMoveToLibrary={controller.moveSelectedToLibrary}
        onDelete={controller.deleteSelectedMedia}
        onOpenInVLC={controller.openSelectedInVLC}
        onRevealFile={controller.revealSelectedFile}
        onCreateCompany={controller.createCompany}
        onCreatePerson={controller.createPerson}
        onCreateCategory={controller.createCategory}
        onCreateTag={controller.createTag}
        onCreateSeries={controller.createSeries}
      />

      <BulkTagDrawer
        open={controller.bulkTagOpen}
        selectedCount={controller.selectedIds.length}
        options={controller.options}
        saving={controller.bulkTagSaving}
        onClose={() => controller.setBulkTagOpen(false)}
        onApply={controller.applyBulkTagging}
      />
    </DashboardShell>
  );
}
