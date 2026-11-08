import { useEffect, useId, useRef, useState } from "react";

import { callPortalSign } from "./services/portalService";
import { formatSignedDate } from "./signingFormat";

/*
  Online signing in the guest portal. The server (portal-sign) checks the
  portal link, task and document again on every call and builds the signed
  PDF; this screen collects the signer's entries and an explicit Sign click.
  Paper upload stays available beside it.
*/

const PAD_WIDTH = 600;
const PAD_HEIGHT = 180;

function makeRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers: RFC 4122 version 4 from Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

// Characters the signed PDF can print (Windows-1252); the server applies the same rule.
const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));
function isPrintableText(text) {
  for (const character of text) {
    const code = character.codePointAt(0);
    const ok =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_EXTRAS.has(character);
    if (!ok) return false;
  }
  return true;
}

function cleanText(value) {
  return String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function formatSize(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);

  useEffect(() => {
    const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
  }, []);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  }

  function start(event) {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = point(event);
  }

  function move(event) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const next = point(event);
    const context = canvasRef.current.getContext("2d");
    context.strokeStyle = "#1d2030";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(drawingRef.current.x, drawingRef.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    drawingRef.current = next;
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = null;
    onChange(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const context = canvasRef.current.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    onChange("");
  }

  return (
    <div className="signing-pad">
      <canvas
        ref={canvasRef}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        role="img"
        aria-label="Signature drawing area. Draw with a mouse, finger or stylus."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <div className="signing-pad-footer">
        <small>Drawing needs a mouse, finger or stylus. A typed signature works the same way.</small>
        <button className="secondary-dashboard-button" type="button" onClick={clear} disabled={disabled}>
          Clear drawing
        </button>
      </div>
    </div>
  );
}

export function SigningPanel({ item, portalToken, groupName, onSigned, onClose }) {
  const headingId = useId();
  const [phase, setPhase] = useState("loading");
  const [opened, setOpened] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [requestKey, setRequestKey] = useState(makeRequestKey);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [forOrganization, setForOrganization] = useState(true);
  const [organizationName, setOrganizationName] = useState(groupName || "");
  const [signatureType, setSignatureType] = useState("typed");
  const [drawing, setDrawing] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const submittingRef = useRef(false);
  const headingRef = useRef(null);

  async function loadDocument() {
    setPhase("loading");
    setLoadError("");
    try {
      const data = await callPortalSign({ action: "open", token: portalToken, itemKey: item.id });
      setOpened(data);
      setPhase("ready");
    } catch (failure) {
      setLoadError(failure.message);
      setPhase("error");
    }
  }

  useEffect(() => {
    let active = true;
    callPortalSign({ action: "open", token: portalToken, itemKey: item.id })
      .then((data) => {
        if (!active) return;
        setOpened(data);
        setPhase("ready");
      })
      .catch((failure) => {
        if (!active) return;
        setLoadError(failure.message);
        setPhase("error");
      });
    headingRef.current?.focus();
    return () => {
      active = false;
    };
  }, [item.id, portalToken]);

  const organization = cleanText(organizationName);
  const authorityText = opened?.agreement?.authorityTemplate?.replace(
    "{organization}",
    organization || "my organization"
  );

  function validate() {
    const name = cleanText(signerName);
    if (name.length < 2) return "Please enter your full name.";
    if (!isPrintableText(name) || !isPrintableText(cleanText(signerTitle)) || !isPrintableText(organization)) {
      return "Some characters can't be printed on the signed PDF yet. Please use Latin letters, or contact Toah Nipi staff.";
    }
    if (forOrganization && organization.length < 2) return "Please enter the organization's name.";
    if (signatureType === "drawn" && !drawing) return "Please draw your signature, or choose a typed signature.";
    if (!agreed) return "Please confirm that you agree to sign electronically.";
    if (forOrganization && !authorityConfirmed) return "Please confirm that you are authorized to sign for your organization.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const problem = validate();
    setError(problem);
    if (problem) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const data = await callPortalSign({
        action: "sign",
        token: portalToken,
        itemKey: item.id,
        documentId: opened.document.id,
        documentSha256: opened.document.sha256,
        requestKey,
        agreementVersion: opened.agreement.version,
        agreed: true,
        signerName: cleanText(signerName),
        signerTitle: cleanText(signerTitle),
        organizationName: forOrganization ? organization : "",
        signsForOrganization: forOrganization,
        authorityConfirmed: forOrganization && authorityConfirmed,
        signatureType,
        drawing: signatureType === "drawn" ? drawing : undefined,
      });
      setResult(data);
      setPhase("done");
      onSigned?.();
    } catch (failure) {
      setError(failure.message);
      if (failure.code === "DOCUMENT_CHANGED") {
        // A new document means a new review and a new request.
        setAgreed(false);
        setAuthorityConfirmed(false);
        setRequestKey(makeRequestKey());
        await loadDocument();
      } else if (failure.code === "TASK_NOT_OPEN") {
        onSigned?.();
      }
      // Network or server errors keep the same request key: retrying cannot sign twice.
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className="signing-panel" aria-labelledby={headingId}>
      <div className="notion-response-panel-heading">
        <div>
          <span className="notion-response-kicker">Sign online</span>
          <strong id={headingId} ref={headingRef} tabIndex={-1}>
            {opened?.document?.title || item.title}
          </strong>
        </div>
        <button className="secondary-dashboard-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {phase === "loading" && <p className="signing-status" role="status">Preparing the document…</p>}

      {phase === "error" && (
        <div className="notion-response-error" role="alert">
          {loadError}
          <div className="signing-actions">
            <button className="secondary-dashboard-button" type="button" onClick={loadDocument}>
              Try again
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="signing-done" role="status">
          <strong>Signed. Thank you.</strong>
          <p>
            {result.signature.documentTitle} was signed by {result.signature.signerName} on{" "}
            {formatSignedDate(result.signature.signedAt)}. Toah Nipi staff will review it.
          </p>
          <div className="signing-actions">
            <a className="primary-dashboard-button" href={result.downloadUrl} target="_blank" rel="noopener noreferrer">
              Download your signed copy
            </a>
          </div>
          <small>You can download it again later from the Documents tab.</small>
        </div>
      )}

      {phase === "ready" && opened && (
        <>
          <div className="signing-document">
            <p>
              Please read the whole document before signing.{" "}
              <span className="signing-file-name">
                {opened.document.fileName}
                {opened.document.size ? ` · ${formatSize(opened.document.size)}` : ""}
              </span>
            </p>
            <div className="signing-actions">
              <a className="secondary-dashboard-button" href={opened.document.viewUrl} target="_blank" rel="noopener noreferrer">
                Open document
              </a>
            </div>
            {/* Out of the Tab order: the browser's PDF viewer would trap keyboard users. "Open document" covers them. */}
            <iframe
              className="signing-preview"
              title={`Preview of ${opened.document.title}`}
              src={opened.document.viewUrl}
              tabIndex={-1}
            />
          </div>

          <form className="signing-form" onSubmit={handleSubmit} noValidate>
            <label className="notion-response-field">
              <span>Your full name</span>
              <input
                type="text"
                autoComplete="name"
                maxLength={120}
                value={signerName}
                disabled={isSubmitting}
                onChange={(event) => {
                  setSignerName(event.target.value);
                  setError("");
                }}
                required
              />
            </label>

            <label className="signing-check">
              <input
                type="checkbox"
                checked={forOrganization}
                disabled={isSubmitting}
                onChange={(event) => setForOrganization(event.target.checked)}
              />
              <span>I am signing on behalf of an organization</span>
            </label>

            {forOrganization && (
              <label className="notion-response-field">
                <span>Organization name</span>
                <input
                  type="text"
                  autoComplete="organization"
                  maxLength={200}
                  value={organizationName}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setOrganizationName(event.target.value);
                    setError("");
                  }}
                />
              </label>
            )}

            <label className="notion-response-field">
              <span>Your title or role (optional)</span>
              <input
                type="text"
                autoComplete="organization-title"
                maxLength={120}
                value={signerTitle}
                disabled={isSubmitting}
                onChange={(event) => setSignerTitle(event.target.value)}
              />
            </label>

            <fieldset className="signing-choice" disabled={isSubmitting}>
              <legend>Signature</legend>
              <label className="signing-check">
                <input
                  type="radio"
                  name={`signature-type-${item.id}`}
                  value="typed"
                  checked={signatureType === "typed"}
                  onChange={() => setSignatureType("typed")}
                />
                <span>Type my name</span>
              </label>
              <label className="signing-check">
                <input
                  type="radio"
                  name={`signature-type-${item.id}`}
                  value="drawn"
                  checked={signatureType === "drawn"}
                  onChange={() => setSignatureType("drawn")}
                />
                <span>Draw my signature</span>
              </label>
            </fieldset>

            {signatureType === "typed" ? (
              <div className="signing-typed-preview" aria-hidden="true">
                {cleanText(signerName) || "Your name"}
              </div>
            ) : (
              <SignaturePad
                onChange={(value) => {
                  setDrawing(value);
                  setError("");
                }}
                disabled={isSubmitting}
              />
            )}

            <label className="signing-check signing-agreement">
              <input
                type="checkbox"
                checked={agreed}
                disabled={isSubmitting}
                onChange={(event) => {
                  setAgreed(event.target.checked);
                  setError("");
                }}
              />
              <span>{opened.agreement.text}</span>
            </label>

            {forOrganization && (
              <label className="signing-check signing-agreement">
                <input
                  type="checkbox"
                  checked={authorityConfirmed}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setAuthorityConfirmed(event.target.checked);
                    setError("");
                  }}
                />
                <span>{authorityText}</span>
              </label>
            )}

            {error && (
              <div className="notion-response-error" role="alert">
                {error}
              </div>
            )}

            <div className="signing-actions">
              <button className="primary-dashboard-button" type="submit" disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
                {isSubmitting ? "Signing…" : "Sign document"}
              </button>
              <button className="secondary-dashboard-button" type="button" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
            </div>

            <p className="notion-response-footer">
              Prefer paper? Close this and use <strong>Upload Paper Copy</strong> to send a printed, signed copy instead.
              Your signed copy will include a page recording the details above and the date and time.
            </p>
          </form>
        </>
      )}
    </section>
  );
}

export function SignedCopyDownload({ portalToken, signatureId, label = "Download" }) {
  const [isBusy, setIsBusy] = useState(false);

  async function handleClick() {
    // Open the tab synchronously so pop-up blockers allow it; links last 10 minutes, so each click gets a fresh one.
    const opened = window.open("", "_blank");
    if (opened) opened.opener = null;
    setIsBusy(true);
    try {
      const { downloadUrl } = await callPortalSign({ action: "download", token: portalToken, signatureId });
      if (opened) opened.location.href = downloadUrl;
      else window.location.href = downloadUrl;
    } catch (failure) {
      opened?.close();
      alert(failure.message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button className="primary-dashboard-button" type="button" onClick={handleClick} disabled={isBusy}>
      {isBusy ? "Preparing…" : label}
    </button>
  );
}
