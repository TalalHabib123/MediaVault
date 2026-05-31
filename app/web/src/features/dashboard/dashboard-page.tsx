import { Alert } from "../../components/ui/alert";
import { DashboardShell } from "../../app/layout/dashboard-shell";
import { NotificationDock } from "../../app/layout/notification-dock";
import { BulkActionsPage } from "../bulk/bulk-actions-page";
import { BulkTagDrawer } from "../library/bulk-tag-drawer";
import { LibraryPage } from "../library/library-page";
import { MediaDetailDrawer } from "../library/media-detail-drawer";
import { MetadataPage } from "../metadata/metadata-page";
import { MoveJobNotification } from "../notifications/move-job-notification";
import { PreviewJobNotification } from "../notifications/preview-job-notification";
import { TaggedSearchPage } from "../search/tagged-search-page";
import { ScannerPage } from "../scanner/scanner-page";
import { SettingsPage } from "../settings/settings-page";
import {
  getDashboardTabMeta,
  getLibraryMediaTypeForTab,
  type TabKey,
} from "./dashboard-tabs";
import { DashboardHome } from "./dashboard-home";
import { useDashboardController } from "./use-dashboard-controller";

export function DashboardPage() {
  const controller = useDashboardController();
  const tabMeta = getDashboardTabMeta(controller.activeTab);
  const tabMediaType = getLibraryMediaTypeForTab(controller.activeTab);
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
          <div className="brand-mark mx-auto">MV</div>
          <h1 className="mt-5 text-3xl font-bold">Loading MediaVault</h1>
          <p className="mt-3 text-sm text-(--text-secondary)">
            Preparing the local vault, metadata options, and dashboard state.
          </p>
        </div>
      </div>
    );
  }

  function openLibraryFilters() {
    if (!isLibraryTab(controller.activeTab)) {
      controller.setActiveTab("library");
    }
  }

  return (
    <DashboardShell
      activeTab={controller.activeTab}
      onTabChange={controller.setActiveTab}
      title={tabMeta.label}
      description={tabMeta.description}
      statusBadges={statusBadges}
      searchValue={controller.librarySearch}
      onSearchChange={controller.setLibrarySearch}
      onScan={controller.runScan}
      scanLoading={controller.scanLoading}
      scanDisabled={controller.config.paths.sources.length === 0}
      scanRunning={controller.scanLoading}
      onOpenFilters={openLibraryFilters}
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
      {controller.activeTab === "dashboard" ? (
        <DashboardHome
          items={controller.visibleItems}
          total={controller.libraryTotal}
          previewAssetVersion={controller.previewAssetVersion}
          scanSummary={controller.scanSummary}
          previewJob={controller.previewJob}
          selectedCount={controller.selectedIds.length}
          hasSources={controller.config.paths.sources.length > 0}
          onOpenPlayer={controller.openPlayer}
          onOpenItem={controller.openItem}
          onTabChange={controller.setActiveTab}
          onScan={controller.runScan}
          scanLoading={controller.scanLoading}
        />
      ) : isLibraryTab(controller.activeTab) ? (
        <LibraryPage
          title={libraryTitle(controller.activeTab)}
          description={libraryDescription(controller.activeTab)}
          items={controller.visibleItems}
          total={controller.libraryTotal}
          previewAssetVersion={controller.previewAssetVersion}
          mediaType={tabMediaType ?? controller.mediaTypeFilter}
          mediaTypeLocked={Boolean(tabMediaType)}
          taggedStatus={controller.taggedStatusFilter}
          onMediaTypeChange={controller.setLibraryMediaType}
          onTaggedStatusChange={controller.setLibraryTaggedStatus}
          search={controller.librarySearch}
          onSearchChange={controller.setLibrarySearch}
          loading={controller.libraryLoading}
          onRefresh={() => void controller.refreshLibrary()}
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
          openVlcAvailable={
            controller.capabilities?.capabilities.open_vlc_on_host ?? false
          }
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
      ) : controller.activeTab === "scanner" ? (
        <ScannerPage
          config={controller.config}
          scanLoading={controller.scanLoading}
          scanSummary={controller.scanSummary}
          previewJob={controller.previewJob}
          moveJob={controller.moveJob}
          onScan={controller.runScan}
          onRefresh={() => void controller.refreshLibrary()}
          onRegenThumbnails={() =>
            void controller.startPreviewRegeneration("thumbnails")
          }
          onRegenHovers={() =>
            void controller.startPreviewRegeneration("hovers")
          }
          previewBusy={controller.previewJob?.status === "running"}
          visibleCount={controller.visibleItems.length}
        />
      ) : controller.activeTab === "bulk" ? (
        <BulkActionsPage
          items={controller.visibleItems}
          selectedIds={controller.selectedIds}
          onClearSelection={controller.clearSelection}
          onOpenBulkTagging={() => controller.setBulkTagOpen(true)}
          onBulkMove={controller.bulkMoveSelected}
          bulkMoving={
            controller.bulkMoving || controller.moveJob?.status === "running"
          }
          onOpenItem={controller.openItem}
          onOpenPlayer={controller.openPlayer}
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
        openVlcAvailable={
          controller.capabilities?.capabilities.open_vlc_on_host ?? false
        }
        revealFileAvailable={
          controller.capabilities?.capabilities.reveal_file_on_host ?? false
        }
        onCreateCompany={controller.createCompany}
        onCreatePerson={controller.createPerson}
        onCreateCategory={controller.createCategory}
        onCreateTag={controller.createTag}
        onCreateSeries={controller.createSeries}
        previewAssetVersion={controller.previewAssetVersion}
        onOpenPlayer={controller.openPlayer}
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

function isLibraryTab(tab: TabKey) {
  return (
    tab === "library" ||
    tab === "movies" ||
    tab === "series" ||
    tab === "videos"
  );
}

function libraryTitle(tab: TabKey) {
  if (tab === "movies") return "Movies";
  if (tab === "series") return "Series Episodes";
  if (tab === "videos") return "General Videos";
  return "All Videos";
}

function libraryDescription(tab: TabKey) {
  if (tab === "movies") {
    return "Browse movie records with large previews, quick playback, and table management when needed.";
  }
  if (tab === "series") {
    return "Review series episodes with season and episode indicators kept visible for ordering work.";
  }
  if (tab === "videos") {
    return "Work through general videos before they are promoted into movie or series metadata.";
  }
  return "Browse the complete local index with grid and table views, removable filters, and bulk selection.";
}
