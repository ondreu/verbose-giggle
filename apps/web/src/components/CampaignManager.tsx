import { useEffect, useState } from "react";
import { useGame, type CampaignInfo } from "../store/store";
import { Icon } from "./Icon";

/**
 * Campaign management modal (#35): browse a campaign's vault files (read-only),
 * export the folder as a .zip, or delete it (the active campaign can't be
 * deleted). Opened per-campaign from the start menu.
 */
export function CampaignManager({ campaign, onClose }: { campaign: CampaignInfo; onClose: () => void }) {
  const fetchCampaignFiles = useGame((s) => s.fetchCampaignFiles);
  const deleteCampaign = useGame((s) => s.deleteCampaign);
  const [files, setFiles] = useState<string[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void fetchCampaignFiles(campaign.folder).then(setFiles);
  }, [fetchCampaignFiles, campaign.folder]);

  const doDelete = async () => {
    setWorking(true);
    setError(null);
    const res = await deleteCampaign(campaign.folder);
    setWorking(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Smazání selhalo");
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex max-h-[85vh] w-full max-w-lg flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="compass" size={18} className="text-ink" />
          <h2 className="font-display text-lg">{campaign.name}</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        <div className="font-log text-[11px] text-ink/60">
          {campaign.folder} · {campaign.party} postav{campaign.active ? " · aktivní" : ""}
        </div>

        {/* Read-only vault file tree */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-sm border border-ink/15 bg-ink/5 p-2">
          {files === null ? (
            <p className="font-body italic text-ink/60">Načítám soubory…</p>
          ) : files.length === 0 ? (
            <p className="font-body italic text-ink/60">Žádné soubory.</p>
          ) : (
            <ul className="font-log text-[12px] text-ink/80">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-1.5 py-0.5">
                  <Icon name={f.endsWith(".md") ? "scroll" : "document"} size={11} className="text-ink/40" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-blood">{error}</p>}

        <div className="mt-4 flex items-center gap-3 border-t border-ink/20 pt-3">
          {/* Export is a plain download link to the export endpoint. */}
          <a
            className="flex items-center gap-1.5 rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20"
            href={`/api/campaigns/${encodeURIComponent(campaign.folder)}/export`}
            download={`${campaign.folder}.zip`}
          >
            <Icon name="document" size={14} /> Export ZIP
          </a>

          {!campaign.active &&
            (confirmDel ? (
              <div className="ml-auto flex items-center gap-2">
                <span className="font-log text-xs text-blood">Opravdu smazat?</span>
                <button
                  className="rounded-sm border border-blood/60 bg-blood/15 px-3 py-1.5 font-display text-sm text-blood hover:bg-blood/25 disabled:opacity-50"
                  disabled={working}
                  onClick={doDelete}
                >
                  Smazat
                </button>
                <button
                  className="font-log text-xs text-ink/60 hover:text-ink"
                  onClick={() => setConfirmDel(false)}
                >
                  zrušit
                </button>
              </div>
            ) : (
              <button
                className="ml-auto flex items-center gap-1.5 rounded-sm border border-blood/40 px-3 py-1.5 font-display text-sm text-blood hover:bg-blood/10"
                onClick={() => setConfirmDel(true)}
              >
                <Icon name="skull" size={14} /> Smazat kampaň
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
