import { useEffect, useMemo, useState } from "react";

import "./App.css";

import {
  fetchPortalRecord,
  markPortalItemReady,
} from "./services/portalService";

/*
  Files placed in the PROJECT ROOT /documents folder are bundled by Vite
  and exposed as real URLs that the browser can open/download.
  Example project structure:
  project/
    documents/
      Sample COI Form.pdf
      Welcome & Reservation Information.pdf
    src/
      App.jsx
*/

const PROJECT_DOCUMENTS = import.meta.glob("/documents/*", {
  eager: true,
  query: "?url",
  import: "default",
});

function getBundledDocumentUrl(fileName) {
  const normalizedFileName =
    String(fileName || "")
      .trim()
      .toLowerCase();
  if (!normalizedFileName) {
    return "";
  }
  const matchedEntry =
    Object.entries(PROJECT_DOCUMENTS)
      .find(([path]) => {
        const pathFileName =
          path
            .split("/")
            .pop()
            ?.toLowerCase();
        return pathFileName === normalizedFileName;
      });
  return matchedEntry?.[1] || "";
}

function getDocumentTypeLabel(fileName) {
  const extension =
    String(fileName || "")
      .split(".")
      .pop()
      ?.trim()
      .toUpperCase();
  if (!extension || extension === String(fileName || "").toUpperCase()) {
    return "FILE";
  }
  return extension;
}

// const PORTAL_RECORDS = {
//   "oak-hill-youth": {
//     id: "booking-001",
//     portalToken: "oak-hill-youth",
//     groupName: "Oak Hill Youth Retreat",
//     contactName: "Jamie Carter",
//     contactEmail: "jamie@example.com",
//     staffEmail: "office@toahnipi.org",
//     retreatDates: "March 14–16, 2026",
//     guestCount: "42 guests",
//     status: "Preparing for contract",
//     lastUpdated: "Feb 4, 2026",
//     checklistItems: [
//       {
//         id: "contract",
//         title: "Review and sign rental contract",
//         description:
//           "Please review the rental agreement and return the signed copy.",
//         status: "waitingOnGuest",
//         required: true,
//         lastChanged: "Feb 4, 2026",
//         dueDate: "Feb 18, 2026",
//         helperText: "Download the contract from Documents, then upload the signed version here.",
//       },
//       {
//         id: "insurance",
//         title: "Submit certificate of insurance",
//         description:
//           "Upload proof of insurance for your group before arrival.",
//         status: "notStarted",
//         required: true,
//         lastChanged: "Not changed yet",
//         dueDate: "Feb 28, 2026",
//         helperText: "PDF, PNG, or JPG is fine for this draft.",
//       },
//       {
//         id: "deposit",
//         title: "Deposit confirmation",
//         description:
//           "Staff will update this once the deposit has been received.",
//         status: "needsReview",
//         required: true,
//         lastChanged: "Feb 6, 2026",
//         dueDate: "Feb 20, 2026",
//         helperText: "This is currently waiting for staff review.",
//       },
//       {
//         id: "guest-count",
//         title: "Confirm final guest count",
//         description:
//           "Send the final number of guests so Toah Nipi can prepare rooms and meals.",
//         status: "notStarted",
//         required: true,
//         lastChanged: "Not changed yet",
//         dueDate: "Mar 1, 2026",
//         helperText: "This could later become an editable form field.",
//       },
//       {
//         id: "schedule",
//         title: "Share retreat schedule",
//         description:
//           "Upload your draft schedule so staff can coordinate meals, spaces, and activities.",
//         status: "completed",
//         required: false,
//         lastChanged: "Feb 2, 2026",
//         dueDate: "Mar 1, 2026",
//         helperText: "Schedule has been received.",
//       },
//     ],
//     documents: [
//       {
//         id: "doc-contract-template",
//         itemId: "contract",
//         title: "Rental Contract Template",
//         type: "Staff Document",
//         fileName: "Oak-Hill-Rental-Contract.pdf",
//         status: "ready",
//         lastChanged: "Feb 4, 2026",
//         note: "Download, sign, and upload the completed version.",
//       },
//       {
//         id: "doc-insurance-guide",
//         itemId: "insurance",
//         title: "Insurance Requirements",
//         type: "Information Sheet",
//         fileName: "Insurance-Requirements.pdf",
//         status: "ready",
//         lastChanged: "Jan 28, 2026",
//         note: "Explains what needs to be listed on the certificate.",
//       },
//       {
//         id: "doc-schedule",
//         itemId: "schedule",
//         title: "Retreat Schedule",
//         type: "Guest Upload",
//         fileName: "Youth-Retreat-Schedule.pdf",
//         status: "completed",
//         lastChanged: "Feb 2, 2026",
//         note: "Uploaded by group leader.",
//       },
//     ],
//   },
// };

function getPortalTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("portal") || "";
}

function getTodayLabel() {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date());
}

function getStatusInfo(status) {
    if (status === "completed") {
        return {
            label: "Complete",
            className: "status-complete",
        };
    }
    if (status === "needsReview") {
        return {
            label: "Needs Staff Review",
            className: "status-review",
        };
    }
    if (status === "waitingOnGuest") {
        return {
            label: "Waiting on You",
            className: "status-waiting",
        };
    }
    if (status === "ready") {
        return {
            label: "Ready",
            className: "status-ready",
        };
    }
    return {
        label: "Not Started",
        className: "status-not-started",
    };
}

function getChecklistProgress(checklistItems) {
    const total = checklistItems.length;
    const completed = checklistItems.filter((item) => item.status === "completed").length;
    const needsReview = checklistItems.filter((item) => item.status === "needsReview").length;
    const open = checklistItems.filter((item) => item.status === "notStarted" || item.status === "waitingOnGuest").length;
    return {
        total,
        completed,
        needsReview,
        open,
        percent: total > 0 ? Math.round(((completed + needsReview) / total) * 100) : 0,
    };
}

export default function App() {
    const portalToken = getPortalTokenFromUrl();
    const [activeTab, setActiveTab] = useState("checklist");
    const [portalRecord, setPortalRecord] = useState(null);
    const [isLoadingPortal, setIsLoadingPortal] = useState(true);
    const [portalError, setPortalError] = useState("");
    const [savingItemId, setSavingItemId] = useState("");
    const checklistItems = portalRecord?.checklistItems || [];
    const documents = portalRecord?.documents || [];
    useEffect(() => {
        let isMounted = true;
        async function loadPortalRecord() {
            if (!portalToken) {
                setPortalError("This portal link is missing a portal token.");
                setIsLoadingPortal(false);
                return;
            }
            try {
                setIsLoadingPortal(true);
                setPortalError("");
                const record = await fetchPortalRecord(portalToken);
                if (!isMounted) {
                    return;
                }
                if (!record) {
                    setPortalRecord(null);
                    setPortalError("This portal link is invalid or has expired.");
                }
                else {
                    setPortalRecord(record);
                }
            }
            catch (error) {
                console.error("Could not load portal record:", error);
                if (isMounted) {
                    setPortalError("Could not load this portal. Please contact Toah Nipi staff.");
                }
            }
            finally {
                if (isMounted) {
                    setIsLoadingPortal(false);
                }
            }
        }
        loadPortalRecord();
        return () => {
            isMounted = false;
        };
    }, [portalToken]);
    const progress = useMemo(() => getChecklistProgress(checklistItems), [checklistItems]);
    function handleUpload(item, file) {
        if (!file) {
            return;
        }
        alert("File uploads are not connected yet. Next step: connect Supabase Storage for portal documents.");
    }
    async function handleMarkReady(item) {
        try {
            setSavingItemId(item.id);
            const updatedRecord = await markPortalItemReady(portalToken, item.id);
            if (!updatedRecord) {
                alert("Could not update this item. Please contact Toah Nipi staff.");
                return;
            }
            setPortalRecord(updatedRecord);
        }
        catch (error) {
            console.error("Could not update portal checklist item:", error);
            alert("Could not update this item. Please try again or contact staff.");
        }
        finally {
            setSavingItemId("");
        }
    }
    if (isLoadingPortal) {
        return (<main className="portal-shell">
        <section className="portal-main">
          <section className="portal-header-card">
            <p className="dashboard-eyebrow">Guest Portal</p>
            <h1>Loading portal...</h1>
            <p className="portal-subtitle">
              Please wait while we load your booking checklist.
            </p>
          </section>
        </section>
      </main>);
    }
    if (portalError || !portalRecord) {
        return (<main className="portal-shell">
        <section className="portal-main">
          <section className="portal-header-card">
            <p className="dashboard-eyebrow">Guest Portal</p>
            <h1>Portal unavailable</h1>
            <p className="portal-subtitle">
              {portalError || "This portal link could not be loaded."}
            </p>
            <a className="secondary-dashboard-button portal-contact-button" href="mailto:office@toahnipi.org">
              Contact Staff
            </a>
          </section>
        </section>
      </main>);
    }
    return (<main className="portal-shell">
      <section className="portal-main">
        <PortalHeader portalRecord={portalRecord} progress={progress} activeTab={activeTab} setActiveTab={setActiveTab} documentCount={documents.length}/>
        <PortalNotice portalToken={portalToken}/>
        {activeTab === "checklist" ? (<ChecklistTab portalRecord={portalRecord} checklistItems={checklistItems} onUpload={handleUpload} onMarkReady={handleMarkReady} savingItemId={savingItemId}/>) : (<DocumentsTab documents={documents}/>)}
      </section>
    </main>);
}

function PortalHeader({ portalRecord, progress, activeTab, setActiveTab, documentCount, }) {
    const FORCE_GNOME_TEST_COMPLETE = false;
    const displayProgressPercent = FORCE_GNOME_TEST_COMPLETE
        ? 100
        : progress.percent;
    const isProgressComplete = FORCE_GNOME_TEST_COMPLETE ||
        (progress.total > 0 && progress.completed === progress.total);
    const progressMarker = isProgressComplete
        ? "98%"
        : `${Math.min(Math.max(displayProgressPercent, 4), 96)}%`;
    const progressGnomeSrc = isProgressComplete
        ? "/gnome_celebration.png"
        : "/gnome_run.png";
    return (<header className="portal-header-card">
      <div className="portal-header-top">
        <div className="portal-brand-row">
          <div className="portal-logo" aria-hidden="true">
            TN
          </div>
          <div className="portal-brand-copy">
            <p className="dashboard-eyebrow">Guest Portal</p>
            <h1>{portalRecord.groupName}</h1>
          </div>
        </div>
        <a className="primary-dashboard-button portal-contact-button" href={`mailto:${portalRecord.staffEmail}`}>
          <PortalIcon type="mail"/>
          <span>Contact Staff</span>
        </a>
      </div>
      <div className="portal-summary-grid">
        <SummaryCard label="Retreat Dates" value={portalRecord.retreatDates} icon="calendar" tone="purple"/>
        <SummaryCard label="Group Size" value={portalRecord.guestCount} icon="users" tone="green"/>
        <SummaryCard label="Portal Status" value={portalRecord.status} icon="shield" tone="blue"/>
        <SummaryCard label="Progress" value={`${progress.percent}%`} icon="progress" tone="gold"/>
      </div>
      <div className="portal-progress-area">
        <div className="portal-progress-label">
          <div className="portal-progress-stats" aria-label="Checklist progress details">
            <span className="portal-progress-stat portal-progress-stat-complete">
              <strong>{progress.completed}</strong> complete
            </span>
            <span className="portal-progress-dot" aria-hidden="true">•</span>
            <span className="portal-progress-stat portal-progress-stat-review">
              <strong>{progress.needsReview}</strong> awaiting review
            </span>
            <span className="portal-progress-dot" aria-hidden="true">•</span>
            <span className="portal-progress-stat portal-progress-stat-open">
              <strong>{progress.open}</strong> open
            </span>
          </div>
          <strong className="portal-progress-percent">{progress.percent}%</strong>
        </div>
        <div className={`portal-progress-track-wrap ${isProgressComplete ? "portal-progress-complete" : ""}`} style={{ "--portal-progress-marker": progressMarker }}>
          <img className="portal-progress-gnome-img" src={progressGnomeSrc} alt="" aria-hidden="true"/>
          <div className="portal-progress-track">
            <div className="portal-progress-fill" style={{ width: `${displayProgressPercent}%` }}/>
          </div>
        </div>
      </div>
      <nav className="portal-tabs" aria-label="Portal sections">
        <button className={activeTab === "checklist" ? "active" : ""} type="button" onClick={() => setActiveTab("checklist")}>
          <PortalIcon type="checklist"/>
          <span className="portal-tab-label">Checklist</span>
          <span className="portal-tab-count">{progress.total}</span>
        </button>
        <button className={activeTab === "documents" ? "active" : ""} type="button" onClick={() => setActiveTab("documents")}>
          <PortalIcon type="document"/>
          <span className="portal-tab-label">Documents</span>
          <span className="portal-tab-count">{documentCount}</span>
        </button>
      </nav>
    </header>);
}

function SummaryCard({ label, value, icon, tone = "purple" }) {
    return (<article className={`portal-summary-card portal-summary-${tone}`}>
      <div className="portal-summary-icon" aria-hidden="true">
        <PortalIcon type={icon}/>
      </div>
      <div className="portal-summary-copy">
        <span className="portal-summary-label">{label}</span>
        <strong>{value}</strong>
      </div>
    </article>);
}

function PortalIcon({ type }) {
    const commonProps = {
        width: 22,
        height: 22,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.9,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
    };
    if (type === "calendar") {
        return (<svg {...commonProps}>
        <rect x="3" y="5" width="18" height="16" rx="2"/>
        <path d="M16 3v4M8 3v4M3 10h18"/>
        <path d="M8 14h3M8 17h6"/>
      </svg>);
    }
    if (type === "users") {
        return (<svg {...commonProps}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>);
    }
    if (type === "shield") {
        return (<svg {...commonProps}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>);
    }
    if (type === "progress") {
        return (<svg {...commonProps}>
        <path d="M4 20V14h4v6H4ZM10 20V9h4v11h-4ZM16 20V4h4v16h-4Z"/>
      </svg>);
    }
    if (type === "mail") {
        return (<svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <path d="m3 7 9 6 9-6"/>
      </svg>);
    }
    if (type === "checklist") {
        return (<svg {...commonProps}>
        <path d="m4 6 1.5 1.5L8 5"/>
        <path d="M11 6h9"/>
        <path d="m4 12 1.5 1.5L8 11"/>
        <path d="M11 12h9"/>
        <path d="m4 18 1.5 1.5L8 17"/>
        <path d="M11 18h9"/>
      </svg>);
    }
    if (type === "document") {
        return (<svg {...commonProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
        <path d="M14 2v6h6M8 13h8M8 17h6"/>
      </svg>);
    }
    return null;
}

function PortalNotice({ portalToken }) {
    return (<section className="portal-notice-card">
      <strong>Draft private link:</strong>
      <span>
        This mock portal is loading from <code>?portal={portalToken}</code>.
        Later, this should be validated by the backend before showing real
        booking details or documents.
      </span>
    </section>);
}

function ChecklistTab({ portalRecord, checklistItems, onUpload, onMarkReady, savingItemId, }) {
    return (<section className="dashboard-card notion-checklist-panel">
      <div className="notion-checklist-header">
        <div>
          <p className="dashboard-eyebrow">Checklist</p>
          <h2>Booking checklist</h2>
          <span>
            A clear overview of what is complete, what needs attention, and what
            staff is reviewing.
          </span>
        </div>
        <div className="notion-checklist-summary">
          <span>{portalRecord.retreatDates}</span>
          <strong>{portalRecord.guestCount}</strong>
        </div>
      </div>
      <div className="notion-table-wrap">
        <div className="notion-table-header">
          <span>Task</span>
          <span>Status</span>
          <span>Due Date</span>
          <span>File</span>
          <span>Action</span>
        </div>
        <div className="notion-table-body">
          {checklistItems.map((item) => (<ChecklistItemCard key={item.id} item={item} onUpload={onUpload} onMarkReady={onMarkReady} isSaving={savingItemId === item.id}/>))}
        </div>
      </div>
    </section>);
}

function ChecklistItemCard({ item, onUpload, onMarkReady, isSaving }) {
    const statusInfo = getStatusInfo(item.status);
    const inputId = `upload-${item.id}`;
    const isLocked = item.status === "completed" || item.status === "needsReview";
    const isStaffOnly = item.guestAction === "none";
    const isGuestCount = item.guestAction === "mark_ready";
    const isUploadItem = item.guestAction === "upload_file";
    function getShortStatusLabel() {
        if (item.status === "completed") {
            return "Complete";
        }
        if (item.status === "needsReview") {
            return "In Review";
        }
        if (item.status === "waitingOnGuest") {
            return "Needs You";
        }
        return "Not Started";
    }
    function getActionLabel() {
        if (item.status === "completed") {
            return "Received";
        }
        if (item.status === "needsReview") {
            return "Submitted";
        }
        if (isStaffOnly) {
            return "Staff Updates";
        }
        if (isGuestCount) {
            return "Submit";
        }
        if (isUploadItem) {
            return item.id === "contract" ? "Upload Signed File" : "Upload File";
        }
        return "No Action";
    }
    function handleGuestCountSubmit() {
        onMarkReady(item);
    }
    return (<article className="notion-table-row">
      <div className="notion-task-cell">
        <div className={`notion-task-icon ${statusInfo.className}`}>
          {item.status === "completed"
            ? "✓"
            : item.status === "needsReview"
                ? "…"
                : ""}
        </div>
        <div className="notion-task-copy">
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <div className="notion-mobile-meta">
            <span>{getShortStatusLabel()}</span>
            <span>Due {item.dueDate}</span>
            <span>{item.required ? "Required" : "Optional"}</span>
          </div>
        </div>
      </div>
      <div className="notion-status-cell">
        <span className={`status-pill ${statusInfo.className}`}>
          {getShortStatusLabel()}
        </span>
      </div>
      <div className="notion-date-cell">
        <span>{item.dueDate}</span>
        <small>{item.required ? "Required" : "Optional"}</small>
      </div>
      <div className="notion-file-cell">
        <span className={item.uploadedFileName ? "has-file" : ""}>
          {item.uploadedFileName || "No upload yet"}
        </span>
      </div>
      <div className="notion-action-cell">
        <input id={inputId} className="hidden-file-input" type="file" disabled={isLocked || !isUploadItem} onChange={(event) => onUpload(item, event.target.files?.[0])}/>
        {isGuestCount && !isLocked ? (<button className="secondary-dashboard-button notion-action-button" type="button" disabled={isSaving} onClick={handleGuestCountSubmit}>
            {isSaving ? "Submitting..." : getActionLabel()}
          </button>) : (<label className={isLocked || !isUploadItem
                ? "secondary-dashboard-button notion-action-button disabled"
                : "primary-dashboard-button notion-action-button"} htmlFor={isLocked || !isUploadItem ? undefined : inputId}>
            {getActionLabel()}
          </label>)}
      </div>
    </article>);
}

function DocumentsTab({ documents }) {
    return (<section className="dashboard-card portal-panel">
      <div className="portal-panel-header">
        <div>
          <p className="dashboard-eyebrow">Documents</p>
          <h2>Files for this booking</h2>
          <span>
            This is where contracts, insurance files, schedules, and staff
            documents will live.
          </span>
        </div>
      </div>
      <div className="documents-list">
        {documents.map((document) => (<DocumentCard key={document.id} document={document}/>))}
      </div>
    </section>);
}

function DocumentCard({ document }) {
    const statusInfo =
        getStatusInfo(
            document.status
        );
    /*
      Prefer a URL supplied by the backend if one is added later.
      Otherwise, match document.fileName against the files that Vite
      bundled from the project-root /documents folder.
    */
    const fileUrl =
        document.fileUrl ||
        document.downloadUrl ||
        document.url ||
        getBundledDocumentUrl(
            document.fileName
        );
    const fileTypeLabel =
        getDocumentTypeLabel(
            document.fileName
        );
    const hasFile =
        Boolean(fileUrl);
    return (
        <article
            className={`document-card ${
                hasFile
                    ? ""
                    : "document-card-missing"
            }`}
        >
            <div
                className="document-file-icon"
                title={fileTypeLabel}
            >
                {fileTypeLabel}
            </div>
            <div className="document-main">
                <div className="document-title-row">
                    <div>
                        <h3>
                            {document.title}
                        </h3>
                        <p>
                            {document.fileName}
                        </p>
                    </div>
                    <span
                        className={`status-pill ${statusInfo.className}`}
                    >
                        {statusInfo.label}
                    </span>
                </div>
                <div className="document-meta-row">
                    <span>
                        {document.type}
                    </span>
                    <span>
                        Last changed: {document.lastChanged}
                    </span>
                </div>
                <p className="document-note">
                    {document.note}
                </p>
            </div>
            <div className="document-actions">
                {hasFile ? (
                    <>
                        <a
                            className="secondary-dashboard-button"
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open
                        </a>
                        <a
                            className="primary-dashboard-button"
                            href={fileUrl}
                            download={document.fileName}
                        >
                            Download
                        </a>
                    </>
                ) : (
                    <span
                        className="document-file-missing"
                        title={`No matching file named "${document.fileName}" was found in the project-root /documents folder.`}
                    >
                        File not found
                    </span>
                )}
            </div>
        </article>
    );
}

function MetaItem({ label, value }) {
    return (<span className="meta-item">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </span>);
}

function SideFact({ label, value }) {
    return (<div className="side-fact">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>);
}
