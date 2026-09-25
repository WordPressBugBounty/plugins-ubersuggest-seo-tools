<?php
defined( 'ABSPATH' ) || exit;

/**
 * The design system's palette for the surfaces that live outside the iframe.
 *
 * wp-admin never sees the React bundle's tokens, so `--primary`, `--foreground`,
 * `--muted-foreground` and `--border` are written out here — in one place, so a
 * rebrand cannot ship the notice and the widget in two different oranges.
 */
final class UBS_SEO_Admin_Brand {

    public const PRIMARY = '#ff5e29';
    public const INK     = '#0a0a0a';
    public const MUTED   = '#52525c';
    public const LINE    = '#d4d4d8';

    /**
     * A core `.button-primary` repainted in the brand, inside $scope.
     *
     * `.wp-core-ui` (a wp-admin body class) is what makes it stick: buttons.css
     * and the admin colour scheme both repaint .button-primary on two classes
     * and both load after our inline block, so a two-class selector ties, loses
     * on order, and ships a core-blue button.
     */
    public static function button_css( string $scope ): string {
        $button = '.wp-core-ui ' . $scope . ' .button-primary';
        return $button . '{background:' . self::PRIMARY . ';border-color:' . self::PRIMARY . ';'
            . 'color:#fff;text-shadow:none;box-shadow:none;height:auto;padding:7px 18px;font-weight:600;border-radius:6px}'
            . $button . ':hover,' . $button . ':focus{background:#e04f1e;border-color:#e04f1e;color:#fff}'
            . $button . ':focus{box-shadow:0 0 0 1px #fff,0 0 0 3px ' . self::PRIMARY . '}';
    }
}
