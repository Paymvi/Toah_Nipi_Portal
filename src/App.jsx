import { useEffect, useMemo, useState } from "react";

import "./App.css";

import { supabase } from "./lib/supabaseClient";

import {
  fetchPortalRecord,
  markPortalItemReady,
  unmarkPortalItemReady,
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

const TEXT_RESPONSE_ITEM_IDS = new Set([
  "food-allergy-information",
  "guest-count",
]);

const FEEDBACK_FORM_URL = "https://forms.gle/rmvSw7x5Lpc8ZAog7";

function isTextResponseItem(item) {
  return TEXT_RESPONSE_ITEM_IDS.has(
    String(item?.id || "").trim()
  );
}

async function fetchPortalBookingReference(portalToken) {
  const cleanedToken = String(portalToken || "").trim();

  if (!cleanedToken) {
    return {
      guestCount: "",
      foodAllergies: "",
    };
  }

  const { data, error } = await supabase.rpc(
    "portal_get_booking_reference",
    {
      p_portal_token: cleanedToken,
    }
  );

  if (error) {
    throw error;
  }

  const reference =
    data && typeof data === "object"
      ? data
      : {};

  return {
    guestCount: String(
      reference.guestCount ||
      reference.guest_count ||
      ""
    ).trim(),
    foodAllergies: String(
      reference.foodAllergies ||
      reference.food_allergies ||
      ""
    ).trim(),
  };
}

function firstNonBlankValue(...values) {
  return values.find((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return String(value).trim().length > 0;
  });
}

function formatReferenceValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry === null || entry === undefined) {
          return "";
        }

        if (typeof entry !== "object") {
          return String(entry).trim();
        }

        const guestName = String(
          entry.guestName ||
          entry.guest_name ||
          entry.personName ||
          entry.person_name ||
          ""
        ).trim();

        const allergyName = String(
          entry.allergy ||
          entry.foodAllergy ||
          entry.food_allergy ||
          entry.name ||
          entry.label ||
          ""
        ).trim();

        const count = String(
          entry.count ||
          entry.quantity ||
          ""
        ).trim();

        if (guestName && allergyName) {
          return `${guestName} — ${allergyName}`;
        }

        if (count && allergyName) {
          return `${count} × ${allergyName}`;
        }

        return allergyName || guestName;
      })
      .filter(Boolean)
      .join("; ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entryValue]) => {
        const formattedValue = formatReferenceValue(entryValue);

        if (!formattedValue) {
          return "";
        }

        const formattedKey = String(key)
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());

        return `${formattedKey}: ${formattedValue}`;
      })
      .filter(Boolean)
      .join("; ");
  }

  return String(value).trim();
}

function getPortalDatabaseReference(portalRecord, bookingReference, itemId) {
  const record = portalRecord || {};
  const secureReference = bookingReference || {};
  const rawData =
    record.rawData ||
    record.raw_data ||
    {};
  const details =
    record.rentalFormDetails ||
    record.rental_form_details ||
    rawData.rentalFormDetails ||
    rawData.rental_form_details ||
    {};

  if (itemId === "guest-count") {
    const secureGuestCount = formatReferenceValue(
      firstNonBlankValue(
        secureReference.guestCount,
        secureReference.guest_count
      )
    );

    const fullTime = firstNonBlankValue(
      record.fullTimeGuests,
      record.full_time_guests,
      details.fullTimeGuests,
      details.full_time_guests,
      details.finalFullTimeGuests,
      details.final_full_time_guests,
      details.fullTimeCount,
      details.full_time_count
    );

    const partTime = firstNonBlankValue(
      record.partTimeGuests,
      record.part_time_guests,
      details.partTimeGuests,
      details.part_time_guests,
      details.finalPartTimeGuests,
      details.final_part_time_guests,
      details.partTimeCount,
      details.part_time_count
    );

    const dayUse = firstNonBlankValue(
      record.dayUseGuests,
      record.day_use_guests,
      details.dayUseGuests,
      details.day_use_guests,
      details.finalDayUseGuests,
      details.final_day_use_guests,
      details.dayUseCount,
      details.day_use_count
    );

    if (fullTime !== undefined || partTime !== undefined || dayUse !== undefined) {
      return [
        fullTime !== undefined ? `Full-time: ${formatReferenceValue(fullTime)}` : "",
        partTime !== undefined ? `Part-time: ${formatReferenceValue(partTime)}` : "",
        dayUse !== undefined ? `Day Use: ${formatReferenceValue(dayUse)}` : "",
      ]
        .filter(Boolean)
        .join("; ");
    }

    if (secureGuestCount) {
      return /^\d+(?:\.\d+)?$/.test(secureGuestCount)
        ? `Total guests: ${secureGuestCount}`
        : secureGuestCount;
    }

    const actualAdults = firstNonBlankValue(
      details.actualAdultGuests,
      details.actual_adult_guests
    );
    const actualChildren = firstNonBlankValue(
      details.actualChildrenGuests,
      details.actual_children_guests
    );
    const childrenUnder3 = firstNonBlankValue(
      details.actualChildrenUnder3,
      details.actual_children_under_3
    );
    const children3to17 = firstNonBlankValue(
      details.actualChildren3to17,
      details.actual_children_3_to_17
    );

    const actualParts = [
      actualAdults !== undefined
        ? `Adults: ${formatReferenceValue(actualAdults)}`
        : "",
      actualChildren !== undefined
        ? `Children: ${formatReferenceValue(actualChildren)}`
        : "",
      childrenUnder3 !== undefined
        ? `Children under 3: ${formatReferenceValue(childrenUnder3)}`
        : "",
      children3to17 !== undefined
        ? `Children 3–17: ${formatReferenceValue(children3to17)}`
        : "",
    ].filter(Boolean);

    if (actualParts.length > 0) {
      return actualParts.join("; ");
    }

    return formatReferenceValue(
      firstNonBlankValue(
        record.actualGuestCount,
        record.actual_guest_count,
        record.attendeeCount,
        record.attendee_count,
        record.guestCount,
        record.guest_count,
        details.actualTotalGuests,
        details.actual_total_guests,
        details.approxTotalGuests,
        details.approx_total_guests
      )
    );
  }

  if (itemId === "food-allergy-information") {
    const allergyValue = firstNonBlankValue(
      secureReference.foodAllergies,
      secureReference.food_allergies,
      record.foodAllergies,
      record.food_allergies,
      record.allergyInformation,
      record.allergy_information,
      record.allergies,
      rawData.foodAllergies,
      rawData.food_allergies,
      rawData.allergies,
      details.foodAllergies,
      details.food_allergies,
      details.allergyInformation,
      details.allergy_information,
      details.allergies
    );

    const formattedAllergies = formatReferenceValue(allergyValue);
    const allergyNotes = formatReferenceValue(
      firstNonBlankValue(
        record.allergyNotes,
        record.allergy_notes,
        rawData.allergyNotes,
        rawData.allergy_notes,
        details.allergyNotes,
        details.allergy_notes
      )
    );

    return [formattedAllergies, allergyNotes]
      .filter(Boolean)
      .join("; ");
  }

  return "";
}

async function fetchPortalChecklistItemResponse(portalToken, itemId) {
  const cleanedToken = String(portalToken || "").trim();
  const cleanedItemId = String(itemId || "").trim();

  if (!cleanedToken || !cleanedItemId) {
    return "";
  }

  const { data, error } = await supabase.rpc(
    "portal_get_checklist_item_response",
    {
      p_portal_token: cleanedToken,
      p_item_id: cleanedItemId,
    }
  );

  if (error) {
    throw error;
  }

  return String(data || "");
}

async function submitPortalChecklistItemResponse(
  portalToken,
  itemId,
  responseText
) {
  const cleanedToken = String(portalToken || "").trim();
  const cleanedItemId = String(itemId || "").trim();
  const cleanedResponse = String(responseText || "").trim();

  if (!cleanedToken || !cleanedItemId || !cleanedResponse) {
    return null;
  }

  const { data, error } = await supabase.rpc(
    "portal_submit_checklist_item_response",
    {
      p_portal_token: cleanedToken,
      p_item_id: cleanedItemId,
      p_response_text: cleanedResponse,
    }
  );

  if (error) {
    throw error;
  }

  return data;
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
    const [bookingReference, setBookingReference] = useState({
        guestCount: "",
        foodAllergies: "",
    });
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
                const [record, currentReference] = await Promise.all([
                    fetchPortalRecord(portalToken),
                    fetchPortalBookingReference(portalToken).catch((error) => {
                        console.error(
                            "Could not load current booking reference information:",
                            error
                        );

                        return {
                            guestCount: "",
                            foodAllergies: "",
                        };
                    }),
                ]);

                if (!isMounted) {
                    return;
                }

                setBookingReference(currentReference);
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
    async function handleUnmarkReady(item) {
        try {
            setSavingItemId(item.id);
            const updatedRecord = await unmarkPortalItemReady(portalToken, item.id);
            if (!updatedRecord) {
                alert("Could not unsubmit this item. Please contact Toah Nipi staff.");
                return;
            }
            setPortalRecord(updatedRecord);
        }
        catch (error) {
            console.error("Could not unsubmit portal checklist item:", error);
            alert("Could not unsubmit this item. Please try again or contact staff.");
        }
        finally {
            setSavingItemId("");
        }
    }
    async function handleSubmitTextResponse(item, responseText) {
        const cleanedResponse = String(responseText || "").trim();

        if (!cleanedResponse) {
            return false;
        }

        try {
            setSavingItemId(item.id);

            const updatedRecord = await submitPortalChecklistItemResponse(
                portalToken,
                item.id,
                cleanedResponse
            );

            if (!updatedRecord) {
                alert("Could not confirm this information. Please contact Toah Nipi staff.");
                return false;
            }

            setPortalRecord(updatedRecord);
            return true;
        }
        catch (error) {
            console.error("Could not submit portal checklist information:", error);
            alert("Could not confirm this information. Please try again or contact staff.");
            return false;
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
        {activeTab === "checklist" ? (<ChecklistTab portalToken={portalToken} portalRecord={portalRecord} bookingReference={bookingReference} checklistItems={checklistItems} onUpload={handleUpload} onMarkReady={handleMarkReady} onUnmarkReady={handleUnmarkReady} onSubmitTextResponse={handleSubmitTextResponse} savingItemId={savingItemId}/>) : (<DocumentsTab documents={documents}/>)}

        <FeedbackCard />
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
    if (type === "feedback") {
        return (<svg {...commonProps}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/>
        <path d="M8 9h8M8 13h5"/>
      </svg>);
    }
    return null;
}

function FeedbackCard() {
    return (
      <section
        className="dashboard-card portal-feedback-card"
        aria-labelledby="portal-feedback-title"
      >
        <div className="portal-feedback-icon" aria-hidden="true">
          <PortalIcon type="feedback"/>
        </div>

        <div className="portal-feedback-content">
          <p className="dashboard-eyebrow">Retreat Feedback</p>
          <h2 id="portal-feedback-title">Tell us about your stay</h2>
          <p>
            After your retreat, we would love to hear about your experience at
            Toah Nipi. Your feedback helps us celebrate what went well and make
            future retreats even better.
          </p>
        </div>

        <div className="portal-feedback-action">
          <a
            className="primary-dashboard-button portal-feedback-button"
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Open Feedback Form</span>
            <span className="portal-feedback-arrow" aria-hidden="true">↗</span>
          </a>

          <span className="portal-feedback-note">
            Opens in a new tab
          </span>
        </div>
      </section>
    );
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

function ChecklistTab({ portalToken, portalRecord, bookingReference, checklistItems, onUpload, onMarkReady, onUnmarkReady, onSubmitTextResponse, savingItemId, }) {
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
          <span>Details</span>
          <span>Action</span>
        </div>
        <div className="notion-table-body">
          {checklistItems.map((item) => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              portalToken={portalToken}
              portalRecord={portalRecord}
              bookingReference={bookingReference}
              onUpload={onUpload}
              onMarkReady={onMarkReady}
              onUnmarkReady={onUnmarkReady}
              onSubmitTextResponse={onSubmitTextResponse}
              isSaving={savingItemId === item.id}
            />
          ))}
        </div>
      </div>
    </section>);
}

function ChecklistItemCard({ item, portalToken, portalRecord, bookingReference, onUpload, onMarkReady, onUnmarkReady, onSubmitTextResponse, isSaving }) {
    const statusInfo = getStatusInfo(item.status);
    const inputId = `upload-${item.id}`;
    const isCompleted = item.status === "completed";
    const isInReview = item.status === "needsReview";
    const isStaffOnly = item.guestAction === "none";
    const isGuestCount = item.guestAction === "mark_ready";
    const isUploadItem = item.guestAction === "upload_file";
    const isTextResponseTask = isTextResponseItem(item);
    const canUnsubmit = isGuestCount && isInReview;
    const isUploadLocked = isCompleted || isInReview;
    const databaseReference = getPortalDatabaseReference(
        portalRecord,
        bookingReference,
        item.id
    );
    const hasDatabaseReference = String(databaseReference || "").trim().length > 0;

    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [responseText, setResponseText] = useState("");
    const [isResponseLoading, setIsResponseLoading] = useState(isTextResponseTask);
    const [responseError, setResponseError] = useState("");

    useEffect(() => {
        let isMounted = true;

        async function loadResponse() {
            if (!isTextResponseTask) {
                setIsResponseLoading(false);
                return;
            }

            try {
                setIsResponseLoading(true);
                setResponseError("");

                const savedResponse = await fetchPortalChecklistItemResponse(
                    portalToken,
                    item.id
                );

                if (isMounted) {
                    setResponseText(savedResponse);
                }
            }
            catch (error) {
                console.error("Could not load portal checklist information:", error);

                if (isMounted) {
                    setResponseError("Could not load the saved information.");
                }
            }
            finally {
                if (isMounted) {
                    setIsResponseLoading(false);
                }
            }
        }

        loadResponse();

        return () => {
            isMounted = false;
        };
    }, [isTextResponseTask, item.id, portalToken]);

    const hasResponseText = String(responseText || "").trim().length > 0;
    const hasConfirmableText = hasResponseText || hasDatabaseReference;
    const responseIsLocked = isCompleted || isInReview;

    function getShortStatusLabel() {
        if (isCompleted) {
            return "Complete";
        }
        if (isInReview) {
            return "In Review";
        }
        if (item.status === "waitingOnGuest") {
            return "Needs You";
        }
        if (isStaffOnly && item.status === "notStarted") {
            return "Pending";
        }
        return "Not Started";
    }

    function getActionLabel() {
        if (isCompleted) {
            return "Received";
        }
        if (canUnsubmit) {
            return "Unconfirm";
        }
        if (isInReview) {
            return "Submitted";
        }
        if (isStaffOnly) {
            return "Staff Updates";
        }
        if (isTextResponseTask) {
            return hasConfirmableText ? "Confirm" : "Add Info";
        }
        if (isGuestCount) {
            return "Confirm";
        }
        if (isUploadItem) {
            return item.id === "contract" ? "Upload Signed File" : "Upload File";
        }
        return "No Action";
    }

    async function handleGuestCountAction() {
        if (canUnsubmit) {
            onUnmarkReady(item);
            return;
        }

        if (isTextResponseTask) {
            const responseToSubmit = String(
                hasResponseText ? responseText : databaseReference
            ).trim();

            if (!responseToSubmit) {
                setIsDetailsOpen(true);
                return;
            }

            const didSubmit = await onSubmitTextResponse(item, responseToSubmit);

            if (didSubmit) {
                setResponseText(responseToSubmit);
                setIsDetailsOpen(true);
            }

            return;
        }

        onMarkReady(item);
    }

    function handleInfoButtonClick() {
        setIsDetailsOpen((current) => !current);
    }

    return (<article className={`notion-table-row ${isDetailsOpen ? "notion-table-row-expanded" : ""}`}>
      <div className="notion-task-cell">
        <div className={`notion-task-icon ${statusInfo.className}`}>
          {isCompleted
            ? "✓"
            : isInReview
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
        {isTextResponseTask ? (
          <button
            className={`notion-info-toggle ${hasConfirmableText ? "has-info" : ""}`}
            type="button"
            disabled={isResponseLoading}
            aria-expanded={isDetailsOpen}
            onClick={handleInfoButtonClick}
          >
            {isResponseLoading
              ? "Loading..."
              : isDetailsOpen
                ? "Hide Info"
                : hasConfirmableText
                  ? "View Info"
                  : "Add Info"}
          </button>
        ) : isUploadItem ? (
          <span className={item.uploadedFileName ? "has-file" : ""}>
            {item.uploadedFileName || "No upload yet"}
          </span>
        ) : isGuestCount ? (
          <span>Confirmation only</span>
        ) : isStaffOnly ? (
          <span>Staff managed</span>
        ) : (
          <span>—</span>
        )}
      </div>
      <div className="notion-action-cell">
        <input id={inputId} className="hidden-file-input" type="file" disabled={isUploadLocked || !isUploadItem} onChange={(event) => onUpload(item, event.target.files?.[0])}/>
        {isGuestCount && !isCompleted ? (<button className={`secondary-dashboard-button notion-action-button ${canUnsubmit ? "notion-action-button-unsubmit" : ""}`} type="button" disabled={isSaving || isResponseLoading} onClick={handleGuestCountAction}>
          {isSaving
            ? canUnsubmit
                ? "Unconfirming..."
                : "Confirming..."
            : getActionLabel()}
        </button>) : (<label className={isUploadLocked || !isUploadItem
            ? `secondary-dashboard-button notion-action-button disabled ${isCompleted ? "portal-checklist-action-received" : ""}`
            : "primary-dashboard-button notion-action-button"} htmlFor={isUploadLocked || !isUploadItem ? undefined : inputId}>
          {getActionLabel()}
        </label>)}
      </div>

      {isTextResponseTask && isDetailsOpen && (
        <div className="notion-response-panel">
          <div className="notion-response-panel-heading">
            <div>
              <span className="notion-response-kicker">
                {item.id === "guest-count" ? "Final guest counts" : "Food allergy information"}
              </span>
              <strong>
                {hasResponseText
                  ? "Your saved response"
                  : hasDatabaseReference
                    ? "Review what is currently on file"
                    : "Add information for staff"}
              </strong>
            </div>

            {isInReview && (
              <span className="notion-response-review-badge">
                Waiting for staff confirmation
              </span>
            )}

            {isCompleted && (
              <span className="notion-response-complete-badge">
                Confirmed by staff
              </span>
            )}
          </div>

          {responseError && (
            <div className="notion-response-error">
              {responseError}
            </div>
          )}

          <div className={`notion-current-reference ${hasDatabaseReference ? "" : "empty"}`}>
            <div className="notion-current-reference-heading">
              <div>
                <span>Currently on file</span>
                <small>From the current booking record</small>
              </div>
              <span className="notion-current-reference-badge">Read only</span>
            </div>

            <div className="notion-current-reference-value">
              {hasDatabaseReference
                ? databaseReference
                : item.id === "guest-count"
                  ? "No guest-count information is currently saved on the booking."
                  : "No food-allergy information is currently saved on the booking."}
            </div>
          </div>

          {item.id === "guest-count" ? (
            <label className="notion-response-field">
              <span>Your confirmation or correction</span>
              <input
                type="text"
                value={responseText}
                disabled={responseIsLocked || isSaving}
                placeholder={
                  hasDatabaseReference
                    ? "If the information above is not accurate, update it here."
                    : "Please enter the final guest counts (full-time, part-time, Day Use)."
                }
                onChange={(event) => setResponseText(event.target.value)}
              />
            </label>
          ) : (
            <label className="notion-response-field">
              <span>Your confirmation or correction</span>
              <textarea
                rows="4"
                value={responseText}
                disabled={responseIsLocked || isSaving}
                placeholder={
                  hasDatabaseReference
                    ? "If the information above is not accurate, update it here."
                    : "Please enter each guest's name and specific food allergy. If there are none, enter 'None'."
                }
                onChange={(event) => setResponseText(event.target.value)}
              />
            </label>
          )}

          <div className="notion-response-footer">
            <span>
              {responseIsLocked
                ? isCompleted
                  ? "Staff has confirmed this information."
                  : "Unsubmit this task if you need to edit the information before staff confirms it."
                : hasResponseText
                  ? "Click Confirm in the Action column when your updated information is ready for staff review."
                  : hasDatabaseReference
                    ? "If the information on file is correct, click Confirm. If not, enter the corrected information above first."
                    : "Please enter the requested information above before confirming this task."}
            </span>
          </div>
        </div>
      )}
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
