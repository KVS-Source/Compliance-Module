import {
  Archive,
  Bell,
  Database,
  FileBarChart,
  Globe2,
  Landmark,
  LocateFixed,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useUiPreferencesContext } from "../../context/UiPreferencesContext";
import {
  defaultUiPreferences,
  type DateStyle,
  type TimeFormat,
} from "../../hooks/useUiPreferences";
import { useApiResource } from "../../hooks/useApiResource";
import { masterDataApi } from "../../services/masterDataApi";

const commonTimeZones = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

interface LiveDeviceLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  capturedAt: number;
}

const liveLocationErrorMessage = (error: GeolocationPositionError) => {
  if (error.code === 1) {
    return "Location permission was denied. Allow location access in the browser and try again.";
  }
  if (error.code === 2) {
    return "Your device could not determine its current location.";
  }
  if (error.code === 3) {
    return "Location detection timed out. Check the device location service and try again.";
  }
  return "The current location could not be detected.";
};

export function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const { preferences, setPreferences } = useUiPreferencesContext();
  const companyId = user?.activeCompany.id ?? "";
  const savedLocation = preferences.workingLocations[companyId];
  const [locationId, setLocationId] = useState(savedLocation?.id ?? "");
  const [timeZone, setTimeZone] = useState(preferences.timeZone);
  const [dateStyle, setDateStyle] = useState<DateStyle>(preferences.dateStyle);
  const [timeFormat, setTimeFormat] =
    useState<TimeFormat>(preferences.timeFormat);
  const [liveLocation, setLiveLocation] =
    useState<LiveDeviceLocation | null>(null);
  const [liveLocationError, setLiveLocationError] = useState("");
  const [liveTracking, setLiveTracking] = useState(false);
  const liveWatchId = useRef<number | null>(null);
  const liveFirstFixReported = useRef(false);

  const locations = useApiResource(masterDataApi.listLocations, [
    contextVersion,
    companyId,
  ]);
  const activeLocations = useMemo(
    () => (locations.data ?? []).filter((location) => location.status === "ACTIVE"),
    [locations.data],
  );
  const timeZones = useMemo(
    () =>
      commonTimeZones.includes(timeZone as (typeof commonTimeZones)[number])
        ? [...commonTimeZones]
        : [timeZone, ...commonTimeZones],
    [timeZone],
  );

  useEffect(() => {
    setLocationId(preferences.workingLocations[companyId]?.id ?? "");
    setTimeZone(preferences.timeZone);
    setDateStyle(preferences.dateStyle);
    setTimeFormat(preferences.timeFormat);
  }, [companyId, preferences]);

  useEffect(() => {
    if (!locations.data || !locationId) return;
    if (!activeLocations.some((location) => location.id === locationId)) {
      setLocationId("");
    }
  }, [activeLocations, locationId, locations.data]);

  useEffect(
    () => () => {
      if (liveWatchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(liveWatchId.current);
      }
    },
    [],
  );

  const stopLiveLocation = () => {
    if (liveWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(liveWatchId.current);
    }
    liveWatchId.current = null;
    setLiveTracking(false);
  };

  const startLiveLocation = () => {
    setLiveLocationError("");
    if (!window.isSecureContext) {
      setLiveLocationError(
        "Live location requires HTTPS or a trusted localhost connection.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setLiveLocationError(
        "This browser or device does not provide location services.",
      );
      return;
    }

    stopLiveLocation();
    liveFirstFixReported.current = false;
    setLiveTracking(true);
    liveWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setLiveLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
          capturedAt: position.timestamp,
        });
        setLiveLocationError("");
        if (!liveFirstFixReported.current) {
          liveFirstFixReported.current = true;
          showToast(
            "success",
            "Live location detected",
            "Coordinates are not saved.",
          );
        }
      },
      (error) => {
        setLiveLocationError(liveLocationErrorMessage(error));
        stopLiveLocation();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 15_000,
      },
    );
  };

  const save = () => {
    const selected = activeLocations.find((location) => location.id === locationId);
    const workingLocations = { ...preferences.workingLocations };
    if (selected) {
      workingLocations[companyId] = {
        id: selected.id,
        code: selected.code,
        name: selected.name,
      };
    } else {
      delete workingLocations[companyId];
    }
    setPreferences({
      ...preferences,
      workingLocations,
      timeZone,
      dateStyle,
      timeFormat,
    });
    showToast(
      "success",
      "Settings saved",
      `Working context updated to ${selected?.name ?? "All locations"}.`,
    );
  };

  const reset = () => {
    setLocationId("");
    setTimeZone(defaultUiPreferences.timeZone);
    setDateStyle(defaultUiPreferences.dateStyle);
    setTimeFormat(defaultUiPreferences.timeFormat);
  };

  return (
    <div className="page settings-page" data-testid="settings-page">
      <PageHeader
        title="Settings"
        section="Company & Account"
        description="Location and display preferences."
        connected
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={reset}>
              <RotateCcw size={15} /> Reset form
            </button>
            <button className="btn btn-primary" type="button" onClick={save}>
              <Save size={15} /> Save settings
            </button>
          </>
        }
      />

      <section className="card settings-context-card">
        <header className="card-head">
          <div>
            <h2>Working context</h2>
          </div>
          <span className="feature-icon tone-blue"><MapPin size={20} /></span>
        </header>
        {locations.loading ? (
          <LoadingState label="Loading Company locations…" />
        ) : locations.error ? (
          <ErrorState error={locations.error} />
        ) : (
          <div className="settings-form-grid">
            <label>
              <span>Active Company</span>
              <input
                className="control"
                value={user?.activeCompany.name ?? ""}
                readOnly
                aria-label="Active Company"
              />
            </label>
            <label>
              <span>Working location</span>
              <select
                className="control"
                value={locationId}
                aria-label="Working location"
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">All locations</option>
                {activeLocations.map((location) => (
                  <option value={location.id} key={location.id}>
                    {location.code} · {location.name}
                  </option>
                ))}
              </select>
              <small>
                Display preference only; this does not filter records.
              </small>
            </label>
            <div className="settings-manage-link">
              <Link className="btn btn-secondary" to="/admin/locations">
                <MapPin size={15} /> Manage locations
              </Link>
            </div>
          </div>
        )}
        <div
          className={`settings-live-location${liveTracking ? " is-tracking" : ""}`}
          data-testid="live-device-location"
        >
          <span className="feature-icon tone-green" aria-hidden="true">
            <LocateFixed size={19} />
          </span>
          <div className="settings-live-location-copy">
            <strong>Live device location</strong>
            <p>
              Use your device location for this session. Coordinates are not saved.
            </p>
            {liveLocationError ? (
              <p className="settings-live-location-error" role="alert">
                {liveLocationError}
              </p>
            ) : null}
            {liveLocation ? (
              <dl className="settings-live-location-values" aria-live="polite">
                <div>
                  <dt>Latitude</dt>
                  <dd>{liveLocation.latitude.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>Longitude</dt>
                  <dd>{liveLocation.longitude.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>Accuracy</dt>
                  <dd>±{Math.round(liveLocation.accuracyMetres)} m</dd>
                </div>
                <div>
                  <dt>Last update</dt>
                  <dd>{new Date(liveLocation.capturedAt).toLocaleTimeString()}</dd>
                </div>
              </dl>
            ) : null}
          </div>
          <div className="settings-live-location-actions">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={liveTracking}
              onClick={startLiveLocation}
            >
              {liveTracking ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <LocateFixed size={15} />
              )}
              {liveTracking ? "Tracking location" : "Use my current location"}
            </button>
            {liveTracking ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={stopLiveLocation}
              >
                <Square size={13} /> Stop
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card settings-context-card">
        <header className="card-head">
          <div>
            <h2>Regional display</h2>
          </div>
          <span className="feature-icon tone-green"><Globe2 size={20} /></span>
        </header>
        <div className="settings-form-grid settings-regional-grid">
          <label>
            <span>Time zone</span>
            <select
              className="control"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {timeZones.map((zone) => <option key={zone}>{zone}</option>)}
            </select>
          </label>
          <label>
            <span>Date format</span>
            <select
              className="control"
              value={dateStyle}
              onChange={(event) => setDateStyle(event.target.value as DateStyle)}
            >
              <option value="long">07 Aug 2026</option>
              <option value="day-first">07/08/2026</option>
              <option value="month-first">08/07/2026</option>
            </select>
          </label>
          <label>
            <span>Time format</span>
            <select
              className="control"
              value={timeFormat}
              onChange={(event) => setTimeFormat(event.target.value as TimeFormat)}
            >
              <option value="12-hour">12-hour</option>
              <option value="24-hour">24-hour</option>
            </select>
          </label>
        </div>
      </section>

      <div className="settings-section-grid">
        <SettingCard
          icon={ShieldCheck}
          tone="purple"
          title="Security & account"
          links={[["Change password", "/account/change-password"]]}
        />
        <SettingCard
          icon={Bell}
          tone="blue"
          title="Notifications & approvals"
          links={[["KPI approvals", "/kpi/approval"], ["Risk register", "/compliance/risks"]]}
        />
        <SettingCard
          icon={Archive}
          tone="amber"
          title="Evidence & governance rules"
          links={[["Evidence library", "/evidence"], ["Policy register", "/compliance/policy-register"]]}
        />
        <SettingCard
          icon={FileBarChart}
          tone="green"
          title="Analytics & reporting"
          links={[["Analytics & Reports", "/reports"], ["KPI analytics", "/kpi/analytics"]]}
        />
        <SettingCard
          icon={Database}
          tone="blue"
          title="Data management"
          links={[["Data import", "/data/import"], ["GenRAC integration", "/data/genrac-integration"]]}
        />
        <SettingCard
          icon={Landmark}
          tone="grey"
          title="Company administration"
          links={hasPermission("organisation:read") ? [["Departments", "/admin/departments"], ["Organisation units", "/admin/organisation-units"]] : []}
        />
      </div>
    </div>
  );
}

function SettingCard({
  icon: Icon,
  tone,
  title,
  links,
}: {
  icon: typeof Settings2;
  tone: string;
  title: string;
  links: string[][];
}) {
  return (
    <section className="card setting-card">
      <div className="card-pad">
        <span className={`feature-icon tone-${tone}`}><Icon size={21} /></span>
        <h2>{title}</h2>
        <div className="setting-links">
          {links.map(([label, to]) => (
            <Link className="btn btn-secondary" to={to!} key={to}>
              <Settings2 size={14} /> {label}
            </Link>
          ))}
          {links.length === 0 ? <span className="muted">No access in this role</span> : null}
        </div>
      </div>
    </section>
  );
}
