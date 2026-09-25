import {
  Button,
  cn,
  ModalDialog,
  Text,
  type TranslationKeys,
  translate,
} from '@ui';
import { type ReactNode, useEffect, useState } from 'react';

import { apiGet, apiPost, reloadApp } from '../../../api';
import { trackConversion } from '../../../tracking/conversion';
import { CARD } from '../../../ui/card';
import { PageHeader } from '../../../ui/page-header';

/**
 * One card of related settings, with its title in the card's header.
 *
 * @param title Catalog key, not a string: the DS resolves it, so a typo fails to
 * compile instead of rendering the raw key (see translation-keys.d.ts). Same for
 * every `label`/`hint` on this page.
 */
function Section({
  title,
  children,
}: {
  title: TranslationKeys;
  children: ReactNode;
}) {
  return (
    <div className={cn(CARD, 'flex flex-col')}>
      <div className="border-zinc-100 border-b p-6">
        <Text
          size="lg"
          weight="semibold"
          className="text-zinc-950"
          text={title}
        />
      </div>
      <div className="flex flex-col gap-5 p-6">{children}</div>
    </div>
  );
}

/** One row inside a {@link Section}: label and optional hint, then the control. */
function Field({
  label,
  hint,
  children,
}: {
  label: TranslationKeys;
  hint?: TranslationKeys;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <Text
          size="sm"
          weight="medium"
          className="text-zinc-900"
          text={label}
        />
        {hint && <Text size="xs" color="muted" text={hint} />}
      </div>
      <div className="w-full sm:w-72">{children}</div>
    </div>
  );
}

/**
 * A fixed fact the user can't change here (their site's domain, the weekly
 * cadence) — a plain read-only value, no lock, since there's nothing to unlock.
 */
function ReadOnlyValue({ value }: { value: ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <Text size="sm" className="text-zinc-700">
        {value}
      </Text>
    </div>
  );
}

/**
 * The same redirect Ubersuggest uses on its own page headers: DS Button asChild
 * wrapping the link, so the anchor carries the button styling.
 *
 * @param href Omitted while the settings request is in flight — the button then
 * renders disabled, since there is no URL to point at yet.
 */
function RedirectButton({
  href,
  label,
  onClick,
}: {
  href?: string;
  label: TranslationKeys;
  onClick?: () => void;
}) {
  if (!href) {
    return (
      <Button
        variant="primary-solid"
        className="shrink-0"
        disabled
        text={label}
      />
    );
  }
  return (
    <Button asChild variant="primary-solid" className="shrink-0">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {translate(label)}
      </a>
    </Button>
  );
}

/**
 * Hands the user off to their Ubersuggest notification settings, in a new tab
 * since the plugin renders inside wp-admin.
 *
 * Audit report emails, the weekly summary and new-issue alerts are per-ACCOUNT
 * preferences owned by Ubersuggest — the plugin has nowhere to persist them (all
 * three were local-only mock switches), so they collapse into this one row.
 */
function NotificationsLink({ href }: { href?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Text size="xs" color="muted" text="settings_notifications_hint" />
      <RedirectButton href={href} label="manage_alerts" />
    </div>
  );
}

type SeoSettings = {
  domain: string;
  crawlFrequency: string;
  planUrl: string;
  notificationsUrl: string;
};

type Connection = {
  connected: boolean;
  connectUrl: string;
  missingScopes: string[];
};

/**
 * Connection status plus the Disconnect action, guarded by a confirmation
 * dialog: disconnecting revokes the tokens on the spot — one stray click and
 * Site Audit / AI fixes stop for the whole site — so the dialog states that
 * consequence before anything happens. On success the iframe reloads, which
 * flips every page to its connect gate at once.
 */
function AccountSection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiGet<Connection>('connection')
      .then(setConnection)
      .catch(() => {});
  }, []);

  const disconnect = () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setFailed(false);
    apiPost<{ ok: boolean }>('connection/disconnect', {})
      .then(() => reloadApp())
      .catch(() => {
        setDisconnecting(false);
        setConfirming(false);
        setFailed(true);
      });
  };

  const statusKey: TranslationKeys = connection?.connected
    ? 'status_connected'
    : 'status_not_connected';
  // A token can exist and still miss scopes added since it was issued — only
  // reconnecting regrants them, so the row offers exactly that.
  const missingScopes = connection?.connected
    ? (connection.missingScopes ?? [])
    : [];

  return (
    <Section title="settings_account">
      <Field label="settings_connection_label">
        <div className="flex items-center justify-end gap-3">
          {/* Unknown (still loading) renders a plain dash, never a wrong status. */}
          {connection === null ? (
            <Text size="sm" color="muted">
              —
            </Text>
          ) : (
            <Text size="sm" color="muted" text={statusKey} />
          )}
          {connection?.connected && (
            <Button
              variant="neutral-outline"
              onClick={() => setConfirming(true)}
              text="disconnect"
            />
          )}
          {connection !== null && !connection.connected && (
            <Button asChild variant="primary-solid">
              {/* target="_top": OAuth must navigate the whole browser (providers
                  refuse to run framed), and the app lives inside an iframe. */}
              <a href={connection.connectUrl} target="_top">
                {translate('connect_account')}
              </a>
            </Button>
          )}
        </div>
      </Field>
      {missingScopes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Text
            size="sm"
            className="text-amber-900"
            text="missing_scopes_warning"
          />
          <Button asChild variant="neutral-outline" className="shrink-0">
            <a href={connection?.connectUrl} target="_top">
              {translate('reconnect_account')}
            </a>
          </Button>
        </div>
      )}
      {failed && (
        <Text size="xs" className="text-red-600" text="disconnect_failed" />
      )}

      <ModalDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        variant="center"
        maxSize="max-w-md"
        content={
          <div className="flex flex-col gap-2 text-center">
            <Text
              as="p"
              size="lg"
              weight="bold"
              className="text-zinc-950"
              text="disconnect_title"
            />
            <Text as="p" color="muted" text="disconnect_body" />
          </div>
        }
        // The {primary, cancel} object footer is the conversion variant's
        // shape (see the free-trial paywall); the center variant renders
        // footer as a plain node, so the buttons are laid out here.
        footer={
          <div className="flex justify-center gap-3">
            <Button
              variant="neutral-outline"
              onClick={() => setConfirming(false)}
              text="cancel"
            />
            <Button
              variant="primary-solid"
              loading={disconnecting}
              onClick={disconnect}
              text="disconnect"
            />
          </div>
        }
      />
    </Section>
  );
}

const FREQUENCY_LABEL: Record<string, TranslationKeys> = {
  weekly: 'frequency_weekly',
  daily: 'frequency_daily',
  monthly: 'frequency_monthly',
};

export default function Settings() {
  const [settings, setSettings] = useState<SeoSettings | null>(null);

  useEffect(() => {
    apiGet<SeoSettings>('settings')
      .then(setSettings)
      .catch(() => {});
  }, []);

  const domain = settings?.domain ?? '—';
  // A cadence the backend doesn't have a label for still shows its raw value
  // rather than an empty cell.
  const frequencyKey = settings && FREQUENCY_LABEL[settings.crawlFrequency];
  const frequency = frequencyKey
    ? translate(frequencyKey)
    : (settings?.crawlFrequency ?? '—');

  return (
    <div className="mx-2 flex flex-col gap-6">
      <PageHeader title="nav_settings" />

      <Section title="settings_general">
        <Field label="settings_domain_label" hint="settings_domain_hint">
          <ReadOnlyValue value={domain} />
        </Field>
      </Section>

      <Section title="nav_site_audit">
        <Field label="settings_frequency_label" hint="settings_frequency_hint">
          <ReadOnlyValue value={frequency} />
        </Field>
        <Field label="settings_max_pages_label" hint="settings_max_pages_hint">
          <div className="flex justify-end">
            <RedirectButton
              href={settings?.planUrl}
              label="view_plans"
              onClick={() =>
                trackConversion('VIEW_PLANS_CLICK', { source: 'settings' })
              }
            />
          </div>
        </Field>
      </Section>

      <Section title="settings_notifications">
        <NotificationsLink href={settings?.notificationsUrl} />
      </Section>

      <AccountSection />
    </div>
  );
}
