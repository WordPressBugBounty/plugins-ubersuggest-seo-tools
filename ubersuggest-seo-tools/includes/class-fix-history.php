<?php
defined( 'ABSPATH' ) || exit;

/**
 * Local audit log of every value this plugin writes to the site — applies and
 * reverts alike. Lives in its own table (not an option: options autoload into
 * every request and can't paginate) because `previous_raw` here is the ONLY
 * copy of what a revert restores; the site's database, not the UBS backend,
 * is the source of truth for what was written.
 *
 * A record is one write to one field of one page:
 *   session_id       groups every write of a single apply/revert request, so
 *                    "undo this whole apply" is a query, not bookkeeping
 *   action           'apply' | 'revert'
 *   reverts          for a revert, the id of the record it undoes
 *   ref              post id, or 'home' for the site-level homepage meta
 *   field            'title' | 'description' | 'h1' | 'home_title' | 'home_description'
 *   previous_raw     the STORED value before the write ('' = no override) —
 *                    what a revert writes back
 *   previous_display the EFFECTIVE value before the write — what a diff shows
 *                    (for titles the rendered fallback, not the empty override)
 *   applied_value    what this write put on the field
 *   source           'ai' | 'edited' — whether the user changed the suggestion
 *   integration      UBS_SEO_Meta_Store::name() that carried the write
 *   page_title/url   snapshot, so the record outlives the page itself
 *   created_at       UTC; rendered in the site timezone at display time
 */
class UBS_SEO_Fix_History {

    /** Bump when the schema below changes; maybe_create_table() migrates via dbDelta. */
    private const SCHEMA_VERSION = '1';

    private const SCHEMA_OPTION = 'ubs_seo_fix_history_schema';

    public const ACTION_APPLY  = 'apply';
    public const ACTION_REVERT = 'revert';

    /**
     * The `ref` of the site-level homepage meta, which has no post behind it.
     * A property of this log's own column; the fixes alias it for `self::`.
     */
    public const HOME_REF = 'home';

    public static function table_name(): string {
        global $wpdb;
        return $wpdb->prefix . 'ubs_seo_fix_history';
    }

    /**
     * Create or migrate the table when the stored schema version is behind.
     * Runs on activation AND on admin_init: activation alone misses plugin
     * UPDATES (WordPress never re-fires it), and every write path starts from
     * a wp-admin page load, so admin_init is early enough. Frontend visitors
     * never reach this — the table costs them nothing.
     */
    public static function maybe_create_table(): void {
        if ( get_option( self::SCHEMA_OPTION ) === self::SCHEMA_VERSION ) {
            return;
        }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        // dbDelta is whitespace-sensitive: two spaces after PRIMARY KEY, no
        // backticks, one column/key per line.
        //
        // ref_field indexes PREFIXES on purpose: (ref, field) in full is 223
        // utf8mb4 chars = 892 bytes, over InnoDB's 767-byte key limit on a
        // COMPACT row format without innodb_large_prefix (MySQL 5.6, MariaDB
        // 10.1/10.2 — inside our "Requires at least: 6.0" window), where the
        // whole CREATE TABLE is rejected with error 1071. Core prefixes the
        // same way (cf. wp_signups' KEY domain_path).
        dbDelta(
            'CREATE TABLE ' . self::table_name() . " (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                session_id char(36) NOT NULL,
                action varchar(10) NOT NULL DEFAULT 'apply',
                reverts bigint(20) unsigned DEFAULT NULL,
                issue_id varchar(64) NOT NULL,
                ref varchar(191) NOT NULL,
                field varchar(32) NOT NULL,
                page_title text NOT NULL,
                page_url text NOT NULL,
                previous_raw longtext NOT NULL,
                previous_display text NOT NULL,
                applied_value longtext NOT NULL,
                source varchar(10) NOT NULL DEFAULT 'ai',
                integration varchar(32) NOT NULL,
                user_id bigint(20) unsigned NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY ref_field (ref(100), field(32)),
                KEY session_id (session_id),
                KEY created_at (created_at)
            ) " . $wpdb->get_charset_collate()
        );
        // Only stamp the version once the table is really there. Stamping it
        // regardless turned any DDL failure into a permanent one: admin_init
        // never retried, record_write() returned 0 for every page, and every
        // Apply answered 'nothing_applied' with nothing naming the cause.
        if ( ! self::table_exists() ) {
            return;
        }
        update_option( self::SCHEMA_OPTION, self::SCHEMA_VERSION );
    }

    /** Whether the history table exists right now. */
    private static function table_exists(): bool {
        global $wpdb;
        $table = self::table_name();
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- schema probe on the plugin's own table.
        return (string) $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) ) === $table;
    }

    /** Groups the writes of one apply/revert request; pass to every record_write(). */
    public static function new_session_id(): string {
        return wp_generate_uuid4();
    }

    /**
     * Persist one write. Call immediately BEFORE the store write, while the
     * previous value is still readable — after it, the old value is gone.
     *
     * @param array{
     *   session_id:string, issue_id:string, ref:string, field:string,
     *   page_title:string, page_url:string,
     *   previous_raw:string, previous_display:string, applied_value:string,
     *   source:string, integration:string,
     *   action?:string, reverts?:int
     * } $entry
     * @return int the record id, or 0 when the insert failed
     */
    public static function record_write( array $entry ): int {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- audit log in the plugin's own table; no WP API writes it.
        $inserted = $wpdb->insert(
            self::table_name(),
            [
                'session_id'       => (string) $entry['session_id'],
                'action'           => (string) ( $entry['action'] ?? self::ACTION_APPLY ),
                'reverts'          => isset( $entry['reverts'] ) ? (int) $entry['reverts'] : null,
                'issue_id'         => (string) $entry['issue_id'],
                'ref'              => (string) $entry['ref'],
                'field'            => (string) $entry['field'],
                'page_title'       => (string) $entry['page_title'],
                'page_url'         => (string) $entry['page_url'],
                'previous_raw'     => (string) $entry['previous_raw'],
                'previous_display' => (string) $entry['previous_display'],
                'applied_value'    => (string) $entry['applied_value'],
                'source'           => (string) $entry['source'],
                'integration'      => (string) $entry['integration'],
                'user_id'          => get_current_user_id(),
                'created_at'       => gmdate( 'Y-m-d H:i:s' ),
            ]
        );
        return $inserted ? (int) $wpdb->insert_id : 0;
    }

    /** Sync a record's applied_value with what the store actually persisted. */
    public static function update_applied_value( int $id, string $value ): void {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- plugin's own table; primary-key update.
        $wpdb->update( self::table_name(), [ 'applied_value' => $value ], [ 'id' => $id ] );
    }

    /**
     * The newest record touching a page field — i.e. the last value THIS plugin
     * put there (`applied_value`, whatever the action: a revert is also a
     * write). Revert compares the field's current value against it before
     * restoring, and conflict detection will read drift from the same row.
     *
     * @return array<string,mixed>|null
     */
    public static function last_write( string $ref, string $field ): ?array {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- plugin's own table; indexed on (ref, field).
        $row = $wpdb->get_row(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal.
                'SELECT * FROM ' . self::table_name() . ' WHERE ref = %s AND field = %s ORDER BY id DESC LIMIT 1',
                $ref,
                $field
            ),
            ARRAY_A
        );
        return is_array( $row ) ? $row : null;
    }

    /**
     * Drop a record whose write never went through. Called when the store
     * refuses the write AFTER the row was inserted: the row would otherwise
     * claim a fix that is not on the page.
     */
    public static function delete_record( int $id ): void {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- plugin's own table; primary-key delete.
        $wpdb->delete( self::table_name(), [ 'id' => $id ] );
    }

    /**
     * Refs with an APPLY record for $issue_id — the candidates for "is another
     * page still holding our fix?" when one page's fix is undone.
     *
     * @return string[]
     */
    public static function applied_refs( string $issue_id ): array {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- plugin's own table; indexed on (ref, field).
        $refs = $wpdb->get_col(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal.
                'SELECT DISTINCT ref FROM ' . self::table_name() . ' WHERE issue_id = %s AND action = %s',
                $issue_id,
                self::ACTION_APPLY
            )
        );
        return is_array( $refs ) ? array_map( 'strval', $refs ) : [];
    }

    /**
     * The WHERE clause and its bound values, shared so list_records() and
     * count_records() cannot filter differently and paginate to a wrong page.
     *
     * @param array{issue_id?:string, ref?:string, search?:string} $args
     * @return array{0:string, 1:array<int,string>}
     */
    private static function filter_clause( array $args ): array {
        global $wpdb;
        $clauses = [ '1=1' ];
        $values  = [];
        // Tested against '', not empty(): empty('0') is true in PHP, and a
        // search for "0" then dropped its own clause and matched everything.
        if ( ( $args['issue_id'] ?? '' ) !== '' ) {
            $clauses[] = 'issue_id = %s';
            $values[]  = (string) $args['issue_id'];
        }
        if ( ( $args['ref'] ?? '' ) !== '' ) {
            $clauses[] = 'ref = %s';
            $values[]  = (string) $args['ref'];
        }
        if ( ( $args['search'] ?? '' ) !== '' ) {
            // Both columns: nobody knows which one holds what they typed.
            $like      = '%' . $wpdb->esc_like( (string) $args['search'] ) . '%';
            $clauses[] = '(page_title LIKE %s OR page_url LIKE %s)';
            $values[]  = $like;
            $values[]  = $like;
        }
        return [ implode( ' AND ', $clauses ), $values ];
    }

    /**
     * One page of the History tab, newest first — ordered by id, not
     * created_at, whose second granularity ties every write of one session.
     *
     * @param array{issue_id?:string, ref?:string, search?:string, per_page?:int, page?:int} $args
     * @return array<int,array<string,mixed>>
     */
    public static function list_records( array $args = [] ): array {
        global $wpdb;
        [ $where, $values ] = self::filter_clause( $args );
        $per_page           = max( 1, min( 100, (int) ( $args['per_page'] ?? 25 ) ) );
        $values[]           = $per_page;
        $values[]           = max( 0, ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per_page );
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- plugin's own table; an audit log must not serve a cached page.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal; $where is built from literals with every value bound.
                'SELECT * FROM ' . self::table_name() . " WHERE {$where} ORDER BY id DESC LIMIT %d OFFSET %d",
                $values
            ),
            ARRAY_A
        );
        return is_array( $rows ) ? $rows : [];
    }

    /** How many records match $args, for the pager. */
    public static function count_records( array $args = [] ): int {
        global $wpdb;
        [ $where, $values ] = self::filter_clause( $args );
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal; $where is built from literals with every value bound.
        $sql = 'SELECT COUNT(*) FROM ' . self::table_name() . " WHERE {$where}";
        // Unfiltered there is nothing to bind, and prepare() without a
        // placeholder is a _doing_it_wrong notice.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- plugin's own table; counts the audit log live.
        return (int) ( $values === [] ? $wpdb->get_var( $sql ) : $wpdb->get_var( $wpdb->prepare( $sql, $values ) ) );
    }

    /**
     * Issue ids the log holds, so the type filter never offers a choice that
     * comes back empty.
     *
     * @return string[]
     */
    public static function issue_types(): array {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- plugin's own table; no user input in the query.
        $ids = $wpdb->get_col( 'SELECT DISTINCT issue_id FROM ' . self::table_name() . ' ORDER BY issue_id' );
        return is_array( $ids ) ? array_map( 'strval', $ids ) : [];
    }

    /**
     * Whether the value $record wrote is no longer the one the log's newest
     * write for that field put there.
     *
     * A value comparison, not a walk of the `reverts` chain: apply → undo →
     * redo puts the ORIGINAL value back, and asking "did anything revert this
     * row?" then marked that apply undone while its value was live. This is
     * correct at any chain depth, and needs no CTE (MySQL 5.6 has none).
     *
     * The scope is the log, not the live field — a value the USER edited is
     * can_revert()'s `value_changed`, a different question.
     *
     * @param array<string,mixed>|null $newest when the caller already read it.
     */
    public static function is_stale_write( array $record, ?array $newest = null ): bool {
        $newest ??= self::last_write( (string) $record['ref'], (string) $record['field'] );
        return $newest !== null
            && (string) $newest['applied_value'] !== (string) $record['applied_value'];
    }

    /**
     * Several records by id, keyed by id — the History tab resolves what every
     * revert row restored, which is one lookup per row unless batched.
     *
     * @param int[] $ids
     * @return array<int,array<string,mixed>>
     */
    public static function find_many( array $ids ): array {
        $ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
        if ( $ids === [] ) {
            return [];
        }
        global $wpdb;
        // One %d per id, every value bound; the count comes from the array.
        $placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- plugin's own table; primary-key batch on the audit log.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal; $placeholders is generated %d markers.
                'SELECT * FROM ' . self::table_name() . " WHERE id IN ({$placeholders})",
                $ids
            ),
            ARRAY_A
        );
        $by_id = [];
        foreach ( is_array( $rows ) ? $rows : [] as $row ) {
            $by_id[ (int) $row['id'] ] = $row;
        }
        return $by_id;
    }

    /** One record by id, or null. */
    public static function find_by_id( int $id ): ?array {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- plugin's own table; primary-key lookup.
        $row = $wpdb->get_row(
            $wpdb->prepare(
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table_name() is $wpdb->prefix + a literal.
                'SELECT * FROM ' . self::table_name() . ' WHERE id = %d',
                $id
            ),
            ARRAY_A
        );
        return is_array( $row ) ? $row : null;
    }
}
