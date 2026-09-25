import {
  Button,
  LoadingSpinner,
  ModalDialog,
  Pagination,
  Text,
  translate,
} from '@ui';
import { type ComponentProps, useState } from 'react';

import { NeilUpgradeIllustration } from '../../../../assets/neil-upgrade-illustration';
import { issueDescription, issueName } from '../../../../i18n/issue-text';
import { dynamicKey } from '../../../../i18n/translate-dynamic';
import { CheckIcon, ExternalLinkIcon, SparklesIcon } from '../../../../icons';
import { trackConversion } from '../../../../tracking/conversion';
import { trackIssues } from '../../../../tracking/issues';
import { SideDrawer } from '../../../../ui/side-drawer';
import { useFixPreview } from '../../hooks/use-fix-preview';
import type { Issue, PreviewRow } from '../../types';
import { FreeTrialPaywall } from '../free-trial-paywall';
import { IssueExplainer } from '../issue-explainer';
import { PreviewCards } from '../preview-cards';
import { DIFFICULTY, IMPACT, MetricBars } from './metric-bars';

// Character limit shown next to each suggestion, mirroring the backend AI prompt
// caps (site_audit_fix.py): meta descriptions 156, titles/H1 60. Anything else
// defaults to 60.
const SUGGESTION_MAX_CHARS: Record<string, number> = {
  meta_description_empty: 156,
  duplicate_meta_descriptions: 156,
};

// What a card prints in place of a current value the page hasn't got. Naming
// the missing thing ("No H1 heading") states the finding; the generic fallback
// covers issues where the flagged value isn't one of these.
// Affected pages per drawer page. Matches the dashboard's code-fix modal
// (PAGE_SIZE = 5) so the drawer paginates exactly like the panel it mirrors.
const PAGE_SIZE = 5;

const EMPTY_VALUE_MESSAGE: Record<string, string> = {
  title_empty: 'no_title',
  meta_description_empty: 'no_meta_description',
  absent_h1_tags: 'no_h1_heading',
};

/**
 * The drawer's variable region: loading the page list → nothing affected → the
 * cards. Early returns keep the three outcomes flat and independently readable,
 * instead of a nested ternary chain.
 */
function DrawerBody({
  opening,
  preview,
  visibleRows,
  isManual,
  cards,
}: {
  opening: boolean;
  preview: PreviewRow[] | null;
  /** The current page's slice of `preview` — what the cards actually render. */
  visibleRows: PreviewRow[];
  isManual: boolean;
  cards: Omit<ComponentProps<typeof PreviewCards>, 'rows'>;
}) {
  if (opening && !preview) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <LoadingSpinner size={16} className="shrink-0 text-orange-600" />
        <Text size="sm" color="muted" text="loading" />
      </div>
    );
  }
  if (preview && preview.length === 0) {
    return (
      <Text
        size="sm"
        color="muted"
        text={isManual ? 'no_pages_found' : 'nothing_to_preview'}
      />
    );
  }
  if (!preview) {
    return null;
  }
  return <PreviewCards rows={visibleRows} {...cards} />;
}

export function IssueRow({
  issue,
  onChanged,
  exiting = false,
  justFixed = false,
  onDrawerToggle,
}: {
  issue: Issue;
  onChanged: () => void;
  /** Row was just fixed: it lingers green in the to-fix tab, fading out, before moving to the Fixed tab. */
  exiting?: boolean;
  /** Resolved while its drawer is open: renders green in place, and only moves to the Fixed tab on close. */
  justFixed?: boolean;
  /** Tells the page a drawer opened/closed, so it can hold the row in place. */
  onDrawerToggle?: (open: boolean) => void;
}) {
  const fix = issue.fix;
  // Applied but the crawl (the source of the count) hasn't re-verified yet:
  // the row sits in the Fixed tab labelled "awaiting recrawl", not as an open
  // fix (Option A — keep the crawl's count as the official number).
  const awaitingRecrawl = fix?.applied === true && fix?.state !== 'ok';
  const fixable = fix?.state === 'fixable' && !awaitingRecrawl;
  const resolved = fix?.state === 'ok';
  // Issues we can't auto-fix here (no fix, or a fix standing down behind another
  // SEO plugin). For these we let the user drill into the affected pages.
  const isManual = !fix || fix.state === 'manual';

  const {
    preview,
    credits,
    opening,
    generatingRefs,
    generating,
    applyingRefs,
    applying,
    recrawlingRefs,
    verdicts,
    fixedAt,
    error,
    freePlan,
    freePaywall,
    openFreePaywall,
    dismissFreePaywall,
    markUpgradeAttempted,
    projectCta,
    dismissProjectCta,
    generatedCount,
    hasSuggestions,
    canAfford,
    openPreview,
    generateRow,
    regenerateRow,
    editRow,
    cancelPreview,
    applyRow,
    applyAll,
    recrawlRow,
    revertRow,
    revertingRefs,
  } = useFixPreview(issue.id, onChanged, isManual);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // 1-based, like the DS Pagination. Applying a fix can drop rows from the
  // preview, so the page in use is always clamped to what's left (`safePage`)
  // rather than trusting this value.
  const [page, setPage] = useState(1);

  const totalRows = preview?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleRows = preview?.slice(pageStart, pageStart + PAGE_SIZE) ?? [];

  // Fixable AND manual issues share the drawer: same card layout, same
  // generate flow — manual cards just have Copy instead of Apply.
  const openDrawer = () => {
    openPreview();
    setPage(1);
    setDrawerOpen(true);
    onDrawerToggle?.(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    cancelPreview();
    onDrawerToggle?.(false);
  };

  // Ported from the dashboard's code-fix-modal header: a generic "SEO Issue"
  // heading, then the issue's own description and its affected-page count on
  // one line with the explainer pushed to the far right. The heading stays
  // generic because the description below already names the issue — using
  // issue.label up here would say the same thing twice.
  //
  // `first-letter:capitalize` because the descriptions are sentence fragments
  // written to trail a count ("with no meta description"); leading the line,
  // they need the capital the source string doesn't carry.
  const header = (
    <div className="flex flex-col gap-1">
      <Text
        size="lg"
        weight="bold"
        className="text-zinc-950"
        text="seo_issue"
      />
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Text size="sm" color="muted" className="first-letter:capitalize">
          {issueDescription(issue.id, issue.label)}
          {issue.count > 0 &&
            ` — ${translate('n_pages_affected', issue.count)}`}
        </Text>
        {/* Unlike the table row the explainer is NOT hidden on narrow screens:
            the drawer goes full-width there, so the panel has the room the
            cramped row didn't. */}
        <span className="shrink-0">
          <IssueExplainer issueId={issue.id} resolved={resolved} />
        </span>
      </div>
    </div>
  );

  return (
    <>
      <tr
        className={`align-middle transition-colors hover:bg-orange-50/40${exiting ? ' row-exit-fade' : ''}`}
      >
        <td className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {resolved || justFixed ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckIcon size={15} className="shrink-0" />
                <Text size="sm" className="text-emerald-700">
                  {issueName(issue.id, issue.label)}
                </Text>
              </span>
            ) : (
              <Text size="sm" className="text-zinc-700">
                {issue.count > 0 && (
                  <span className="font-semibold text-orange-600">
                    {translate('pages_count', issue.count)}{' '}
                  </span>
                )}
                {issueDescription(issue.id, issue.label)}
              </Text>
            )}
            {/* Hidden on narrow screens, as in the dashboard: a 620px panel has
                nowhere to go on a phone, and the row is already tight there. */}
            <span className="hidden md:inline-flex">
              <IssueExplainer issueId={issue.id} resolved={resolved} />
            </span>
          </div>
        </td>

        <td className="px-3 py-4">
          {IMPACT[issue.seoImpact] ? (
            <MetricBars
              level={IMPACT[issue.seoImpact].level}
              color={IMPACT[issue.seoImpact].color}
              label={translate(IMPACT[issue.seoImpact].key)}
              title={translate('impact_tooltip')}
            />
          ) : (
            <span className="text-zinc-300">—</span>
          )}
        </td>

        <td className="px-3 py-4">
          {DIFFICULTY[issue.difficulty] ? (
            <MetricBars
              level={DIFFICULTY[issue.difficulty].level}
              color={DIFFICULTY[issue.difficulty].color}
              label={translate(DIFFICULTY[issue.difficulty].key)}
              title={translate('difficulty_tooltip')}
            />
          ) : (
            <span className="text-zinc-300">—</span>
          )}
        </td>

        <td className="px-5 py-4">
          <div className="flex items-center justify-end gap-2">
            {isManual && (
              <Button variant="neutral-outline" onClick={openDrawer}>
                <Text size="sm" text="view_pages" />
              </Button>
            )}
            {resolved && <Text size="xs" color="muted" text="resolved" />}
            {awaitingRecrawl && (
              <Text size="xs" color="muted" text="awaiting_recrawl" />
            )}
            {fixable && (
              <Button
                variant="primary-solid"
                onClick={() => {
                  openDrawer();
                  trackIssues('FIX_IT_CLICK', { issue: issue.id });
                }}
              >
                <SparklesIcon size={14} className="text-white" />
                <Text size="sm" className="text-white" text="fix_it" />
              </Button>
            )}
          </div>
        </td>
      </tr>

      <SideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        header={header}
        footer={
          preview && preview.length > 0 ? (
            // Same footer shape as the dashboard's code-fix modal: pagination
            // on the left, actions pushed to the right. (Ignore issue / Mark as
            // done aren't part of the plugin yet.)
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {totalPages > 1 && (
                <Pagination
                  variant="lg"
                  className="w-full justify-start border-none pl-0 sm:w-auto"
                  numberOfPages={totalPages}
                  totalItems={totalRows}
                  pageSize={PAGE_SIZE}
                  page={safePage}
                  onClickPage={setPage}
                  onClickNext={() =>
                    setPage(Math.min(totalPages, safePage + 1))
                  }
                  onClickBack={() => setPage(Math.max(1, safePage - 1))}
                />
              )}
              <div className="flex flex-wrap items-center justify-end gap-3 sm:ml-auto">
                {credits && (
                  <Text size="xs" color="muted">
                    {canAfford
                      ? translate('credits_left', credits.remaining)
                      : translate('out_of_credits')}
                  </Text>
                )}
                {generating && (
                  <Text
                    size="xs"
                    color="muted"
                    text="generating_hint_progress"
                    translationConfig={{
                      translationVariables: [generatedCount, preview.length],
                    }}
                  />
                )}
                <Button variant="neutral-outline" onClick={closeDrawer}>
                  <Text size="sm" text="cancel" />
                </Button>
                {!isManual && hasSuggestions && !generating && (
                  <Button
                    variant="primary-solid"
                    loading={applying}
                    disabled={applying}
                    onClick={applyAll}
                  >
                    <Text
                      size="sm"
                      className="text-white"
                      text={applying ? 'applying' : 'apply_changes'}
                    />
                  </Button>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <Text size="sm" className="text-red-600">
              {error}
            </Text>
          )}

          <DrawerBody
            opening={opening}
            preview={preview}
            visibleRows={visibleRows}
            isManual={isManual}
            cards={{
              generatingRefs,
              applyingRefs,
              recrawlingRefs,
              revertingRefs,
              verdicts,
              fixedAt,
              canAfford,
              canApply: !isManual,
              cost: credits?.cost ?? 2,
              maxChars: SUGGESTION_MAX_CHARS[issue.id] ?? 60,
              emptyValueKey: EMPTY_VALUE_MESSAGE[issue.id] ?? 'no_value',
              // H1's undo removes a content heading; the others clear a field.
              undoEmptyBodyKey:
                issue.id === 'absent_h1_tags'
                  ? 'undo_fix_body_h1'
                  : 'undo_fix_body_empty',
              onGenerate: generateRow,
              onRegenerate: regenerateRow,
              // A free account out of credits has no Generate button, so the
              // blocked card offers the trial paywall directly.
              onFreePlanUpgrade: freePlan ? openFreePaywall : undefined,
              onEdit: editRow,
              onApply: applyRow,
              onRecrawl: recrawlRow,
              onRevert: revertRow,
            }}
          />
        </div>
      </SideDrawer>

      <FreeTrialPaywall
        open={freePaywall}
        onClose={dismissFreePaywall}
        onUpgrade={markUpgradeAttempted}
      />

      {/* Conversion modal in the app's paywall shape: pitch + big CTA on the
          left, the fix's details on a tinted panel on the right. AI can't run
          without a UBS project for this domain. Above the drawer's z-100000. */}
      <ModalDialog
        isOpen={projectCta != null}
        onClose={dismissProjectCta}
        variant="center"
        maxSize="max-w-3xl"
        zIndex="z-[100001]"
        content={
          projectCta && (
            <div className="grid gap-8 p-2 text-left sm:min-h-[420px] sm:grid-cols-2">
              <div className="flex flex-col gap-4 py-2">
                <Text
                  as="p"
                  size="3xl"
                  weight="bold"
                  className="text-zinc-950 leading-tight"
                  text="project_required_title"
                />
                <Text
                  as="p"
                  color="muted"
                  text="project_required_body"
                  translationConfig={{
                    translationVariables: [projectCta.domain],
                  }}
                />
                <div className="mt-auto flex flex-col items-center gap-2 pt-4">
                  <Button
                    asChild
                    variant="primary-cta"
                    size="xl"
                    className="w-full"
                  >
                    <a
                      href={projectCta.upgradeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        trackConversion('VIEW_PLANS_CLICK', {
                          source: 'project_paywall',
                        });
                        dismissProjectCta();
                      }}
                    >
                      <Text className="text-white" text="upgrade_plan_cta" />
                    </a>
                  </Button>
                  <Button variant="link" onClick={dismissProjectCta}>
                    <Text size="sm" color="muted" text="maybe_later" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl bg-orange-50 p-5">
                <NeilUpgradeIllustration className="mx-auto h-36 w-auto object-contain" />
                <Text
                  size="lg"
                  weight="bold"
                  className="text-orange-600"
                  text="fix_details"
                />
                <dl className="flex flex-col divide-y divide-orange-100 text-sm">
                  {[
                    ['detail_site', projectCta.domain],
                    ['detail_issue', issueName(issue.id, issue.label)],
                    ['detail_pages', translate('pages_count', issue.count)],
                  ].map(([labelKey, value]) => (
                    <div
                      key={labelKey}
                      className="flex items-baseline justify-between gap-4 py-2"
                    >
                      <Text
                        as="dt"
                        size="sm"
                        color="muted"
                        text={dynamicKey(labelKey)}
                      />
                      <Text
                        as="dd"
                        size="sm"
                        weight="semibold"
                        className="text-right text-zinc-900"
                      >
                        {value}
                      </Text>
                    </div>
                  ))}
                </dl>
                <a
                  href={projectCta.manageProjectsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={dismissProjectCta}
                  className="inline-flex items-center gap-1 font-semibold text-orange-600 text-sm hover:underline"
                >
                  {translate('add_project_cta')}
                  <ExternalLinkIcon size={14} className="shrink-0" />
                </a>
              </div>
            </div>
          )
        }
      />
    </>
  );
}
