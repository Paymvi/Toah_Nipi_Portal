import { useMemo, useState } from "react";
import "./App.css";

const PORTAL_RECORDS = {
  "oak-hill-youth": {
    id: "booking-001",
    portalToken: "oak-hill-youth",
    groupName: "Oak Hill Youth Retreat",
    contactName: "Jamie Carter",
    contactEmail: "jamie@example.com",
    staffEmail: "office@toahnipi.org",
    retreatDates: "March 14–16, 2026",
    guestCount: "42 guests",
    status: "Preparing for contract",
    lastUpdated: "Feb 4, 2026",
    checklistItems: [
      {
        id: "contract",
        title: "Review and sign rental contract",
        description:
          "Please review the rental agreement and return the signed copy.",
        status: "waitingOnGuest",
        required: true,
        lastChanged: "Feb 4, 2026",
        dueDate: "Feb 18, 2026",
        helperText: "Download the contract from Documents, then upload the signed version here.",
      },
      {
        id: "insurance",
        title: "Submit certificate of insurance",
        description:
          "Upload proof of insurance for your group before arrival.",
        status: "notStarted",
        required: true,
        lastChanged: "Not changed yet",
        dueDate: "Feb 28, 2026",
        helperText: "PDF, PNG, or JPG is fine for this draft.",
      },
      {
        id: "deposit",
        title: "Deposit confirmation",
        description:
          "Staff will update this once the deposit has been received.",
        status: "needsReview",
        required: true,
        lastChanged: "Feb 6, 2026",
        dueDate: "Feb 20, 2026",
        helperText: "This is currently waiting for staff review.",
      },
      {
        id: "guest-count",
        title: "Confirm final guest count",
        description:
          "Send the final number of guests so Toah Nipi can prepare rooms and meals.",
        status: "notStarted",
        required: true,
        lastChanged: "Not changed yet",
        dueDate: "Mar 1, 2026",
        helperText: "This could later become an editable form field.",
      },
      {
        id: "schedule",
        title: "Share retreat schedule",
        description:
          "Upload your draft schedule so staff can coordinate meals, spaces, and activities.",
        status: "completed",
        required: false,
        lastChanged: "Feb 2, 2026",
        dueDate: "Mar 1, 2026",
        helperText: "Schedule has been received.",
      },
    ],
    documents: [
      {
        id: "doc-contract-template",
        itemId: "contract",
        title: "Rental Contract Template",
        type: "Staff Document",
        fileName: "Oak-Hill-Rental-Contract.pdf",
        status: "ready",
        lastChanged: "Feb 4, 2026",
        note: "Download, sign, and upload the completed version.",
      },
      {
        id: "doc-insurance-guide",
        itemId: "insurance",
        title: "Insurance Requirements",
        type: "Information Sheet",
        fileName: "Insurance-Requirements.pdf",
        status: "ready",
        lastChanged: "Jan 28, 2026",
        note: "Explains what needs to be listed on the certificate.",
      },
      {
        id: "doc-schedule",
        itemId: "schedule",
        title: "Retreat Schedule",
        type: "Guest Upload",
        fileName: "Youth-Retreat-Schedule.pdf",
        status: "completed",
        lastChanged: "Feb 2, 2026",
        note: "Uploaded by group leader.",
      },
    ],
  },
};

function getPortalTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("portal") || "oak-hill-youth";
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
  const completed = checklistItems.filter(
    (item) => item.status === "completed"
  ).length;
  const needsReview = checklistItems.filter(
    (item) => item.status === "needsReview"
  ).length;
  const open = checklistItems.filter(
    (item) =>
      item.status === "notStarted" || item.status === "waitingOnGuest"
  ).length;

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
  const portalRecord =
    PORTAL_RECORDS[portalToken] || PORTAL_RECORDS["oak-hill-youth"];

  const [activeTab, setActiveTab] = useState("checklist");
  const [checklistItems, setChecklistItems] = useState(
    portalRecord.checklistItems
  );
  const [documents, setDocuments] = useState(portalRecord.documents);

  const progress = useMemo(
    () => getChecklistProgress(checklistItems),
    [checklistItems]
  );

  function handleUpload(item, file) {
    if (!file) {
      return;
    }

    const changedDate = getTodayLabel();

    setChecklistItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              status: "needsReview",
              lastChanged: changedDate,
              uploadedFileName: file.name,
            }
          : currentItem
      )
    );

    setDocuments((currentDocuments) => {
      const uploadedDocument = {
        id: `upload-${item.id}`,
        itemId: item.id,
        title: `${item.title} Upload`,
        type: "Guest Upload",
        fileName: file.name,
        status: "needsReview",
        lastChanged: changedDate,
        note: "Uploaded in this draft portal. Later this will save to the server.",
        uploadedByGuest: true,
      };

      return [
        uploadedDocument,
        ...currentDocuments.filter(
          (document) => document.id !== uploadedDocument.id
        ),
      ];
    });
  }

  function handleMarkReady(item) {
    const changedDate = getTodayLabel();

    setChecklistItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              status: "needsReview",
              lastChanged: changedDate,
            }
          : currentItem
      )
    );
  }

  return (
    <main className="portal-shell">
      <section className="portal-main">
        <PortalHeader
          portalRecord={portalRecord}
          progress={progress}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          documentCount={documents.length}
        />

        <PortalNotice portalToken={portalToken} />

        {activeTab === "checklist" ? (
          <ChecklistTab
            portalRecord={portalRecord}
            checklistItems={checklistItems}
            onUpload={handleUpload}
            onMarkReady={handleMarkReady}
          />
        ) : (
          <DocumentsTab documents={documents} />
        )}
      </section>
    </main>
  );
}

function PortalHeader({
  portalRecord,
  progress,
  activeTab,
  setActiveTab,
  documentCount,
}) {
  return (
    <header className="portal-header-card">
      <div className="portal-header-top">
        <div className="portal-brand-row">
          <div className="portal-logo">TN</div>

          <div>
            <p className="dashboard-eyebrow">Guest Portal</p>
            <h1>{portalRecord.groupName}</h1>
            <p className="portal-subtitle">
              Checklist and documents for your upcoming Toah Nipi booking.
            </p>
          </div>
        </div>

        <a
          className="secondary-dashboard-button portal-contact-button"
          href={`mailto:${portalRecord.staffEmail}`}
        >
          Contact Staff
        </a>
      </div>

      <div className="portal-summary-grid">
        <SummaryCard label="Retreat Dates" value={portalRecord.retreatDates} />
        <SummaryCard label="Group Size" value={portalRecord.guestCount} />
        <SummaryCard label="Portal Status" value={portalRecord.status} />
        <SummaryCard label="Progress" value={`${progress.percent}%`} />
      </div>

      <div className="portal-progress-area">
        <div className="portal-progress-label">
          <span>
            {progress.completed} complete · {progress.needsReview} awaiting
            review · {progress.open} open
          </span>
          <strong>{progress.percent}%</strong>
        </div>

        <div className="portal-progress-track">
          <div
            className="portal-progress-fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <nav className="portal-tabs" aria-label="Portal sections">
        <button
          className={activeTab === "checklist" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("checklist")}
        >
          Checklist
          <span>{progress.total}</span>
        </button>

        <button
          className={activeTab === "documents" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("documents")}
        >
          Documents
          <span>{documentCount}</span>
        </button>
      </nav>
    </header>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="portal-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PortalNotice({ portalToken }) {
  return (
    <section className="portal-notice-card">
      <strong>Draft private link:</strong>
      <span>
        This mock portal is loading from <code>?portal={portalToken}</code>.
        Later, this should be validated by the backend before showing real
        booking details or documents.
      </span>
    </section>
  );
}

function ChecklistTab({
  portalRecord,
  checklistItems,
  onUpload,
  onMarkReady,
}) {
  return (
    <div className="portal-content-grid">
      <section className="dashboard-card portal-panel">
        <div className="portal-panel-header">
          <div>
            <p className="dashboard-eyebrow">Checklist</p>
            <h2>Required next steps</h2>
            <span>
              Complete each item below. Status and last changed dates are shown
              for both the guest and staff side.
            </span>
          </div>
        </div>

        <div className="checklist-list">
          {checklistItems.map((item) => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              onUpload={onUpload}
              onMarkReady={onMarkReady}
            />
          ))}
        </div>
      </section>

      <aside className="dashboard-card portal-side-card">
        <div className="portal-panel-header compact">
          <div>
            <p className="dashboard-eyebrow">Booking Snapshot</p>
            <h2>Group details</h2>
          </div>
        </div>

        <div className="portal-side-list">
          <SideFact label="Group" value={portalRecord.groupName} />
          <SideFact label="Primary Contact" value={portalRecord.contactName} />
          <SideFact label="Email" value={portalRecord.contactEmail} />
          <SideFact label="Dates" value={portalRecord.retreatDates} />
          <SideFact label="Guests" value={portalRecord.guestCount} />
          <SideFact label="Last Updated" value={portalRecord.lastUpdated} />
        </div>
      </aside>
    </div>
  );
}

function ChecklistItemCard({ item, onUpload, onMarkReady }) {
  const statusInfo = getStatusInfo(item.status);
  const inputId = `upload-${item.id}`;

  const isLocked =
    item.status === "completed" || item.status === "needsReview";

  return (
    <article className={`checklist-card ${statusInfo.className}`}>
      <div className="checklist-card-main">
        <div className="checklist-card-status-icon">
          {item.status === "completed" ? "✓" : item.status === "needsReview" ? "…" : "!"}
        </div>

        <div className="checklist-card-content">
          <div className="checklist-card-title-row">
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>

            <span className={`status-pill ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="checklist-meta-grid">
            <MetaItem label="Due Date" value={item.dueDate} />
            <MetaItem label="Last Changed" value={item.lastChanged} />
            <MetaItem
              label="Required"
              value={item.required ? "Required" : "Optional"}
            />
            <MetaItem
              label="File"
              value={item.uploadedFileName || "No upload yet"}
            />
          </div>

          <p className="checklist-helper">{item.helperText}</p>

          <div className="checklist-actions">
            <input
              id={inputId}
              className="hidden-file-input"
              type="file"
              onChange={(event) => onUpload(item, event.target.files?.[0])}
            />

            <label className="secondary-dashboard-button" htmlFor={inputId}>
              Upload File
            </label>

            <button
              className="primary-dashboard-button"
              type="button"
              disabled={isLocked}
              onClick={() => onMarkReady(item)}
            >
              Mark Ready for Staff Review
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function DocumentsTab({ documents }) {
  return (
    <section className="dashboard-card portal-panel">
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
        {documents.map((document) => (
          <DocumentCard key={document.id} document={document} />
        ))}
      </div>
    </section>
  );
}

function DocumentCard({ document }) {
  const statusInfo = getStatusInfo(document.status);

  function showDraftMessage() {
    alert(
      "Draft only: later this button will open or download the real file from the server."
    );
  }

  return (
    <article className="document-card">
      <div className="document-file-icon">PDF</div>

      <div className="document-main">
        <div className="document-title-row">
          <div>
            <h3>{document.title}</h3>
            <p>{document.fileName}</p>
          </div>

          <span className={`status-pill ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="document-meta-row">
          <span>{document.type}</span>
          <span>Last changed: {document.lastChanged}</span>
        </div>

        <p className="document-note">{document.note}</p>
      </div>

      <div className="document-actions">
        <button
          className="secondary-dashboard-button"
          type="button"
          onClick={showDraftMessage}
        >
          Open
        </button>

        <button
          className="primary-dashboard-button"
          type="button"
          onClick={showDraftMessage}
        >
          Download
        </button>
      </div>
    </article>
  );
}

function MetaItem({ label, value }) {
  return (
    <span className="meta-item">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </span>
  );
}

function SideFact({ label, value }) {
  return (
    <div className="side-fact">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>
  );
}