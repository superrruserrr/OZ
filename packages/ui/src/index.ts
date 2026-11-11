/** Design system, jetons, composants (lots 0.4, 0.10) */
export const PACKAGE_NAME = '@oz/ui' as const;

export { contrastRatio } from './contrast.js';
export { OZ_DEFAULT_MODE, OZ_MODES, ozThemes, type OzColor, type OzMode } from './tokens.js';
export { cn } from './lib/cn.js';
export { Button, type ButtonProps } from './components/button.js';
export { Field, type FieldProps } from './components/field.js';
export { Select, type SelectOption, type SelectProps } from './components/select.js';
export { Badge, type BadgeProps, type BadgeTone } from './components/badge.js';
export { Card, type CardProps } from './components/card.js';
export { Logo, LOGO_FILES, type LogoProps } from './components/logo.js';
export { Table, type TableColumn, type TableProps } from './components/table.js';
export { Modal, type ModalProps, type ModalValues } from './components/modal.js';
export {
  Notification,
  NotificationProvider,
  type NotificationProps,
  type NotificationProviderProps,
  type NotificationTone,
} from './components/notification.js';
export { StepProgress, type StepProgressProps } from './components/step-progress.js';
export { OtpInput, type OtpInputProps } from './components/otp-input.js';
export {
  ChoiceCardGroup,
  type ChoiceCardGroupProps,
  type ChoiceOption,
} from './components/choice-card.js';
export { IconTile, type IconTileProps } from './components/icon-tile.js';
export { Callout, type CalloutProps } from './components/callout.js';
export { CheckList, type CheckListProps } from './components/check-list.js';
export { FilterChip, type FilterChipProps } from './components/filter-chip.js';
export { TabBar, TAB_BAR_MAX, type TabBarProps, type TabItem } from './components/tab-bar.js';
export { DotPagination, type DotPaginationProps } from './components/dot-pagination.js';
export {
  Skeleton,
  SkeletonGroup,
  type SkeletonGroupProps,
  type SkeletonProps,
} from './components/skeleton.js';
export { MeasureBar, type MeasureBarProps } from './components/measure-bar.js';
export { OzIdCard, type OzIdCardProps } from './components/oz-id-card.js';
export {
  AppShell,
  type AppShellNav,
  type AppShellNavSection,
  type AppShellProps,
} from './components/app-shell.js';
export { type NavLinkProps } from './components/tab-bar.js';
export {
  FloatingChip,
  GlassPanel,
  Halo,
  OzIdReveal,
  PitchCircles,
  type FloatingChipProps,
  type GlassPanelProps,
  type HaloProps,
  type OzIdRevealProps,
} from './components/emotion.js';
export {
  Kicker,
  SPLIT_HEADING_MIN_PX,
  SplitHeading,
  type KickerProps,
  type SplitHeadingProps,
} from './components/sport.js';
export { STADIUM_GLOWS, StadiumHero, type StadiumHeroProps } from './components/stadium-hero.js';
export { LivePanel, type LiveFact, type LivePanelProps } from './components/live-panel.js';
export { ValueCard, type CardLinkProps, type ValueCardProps } from './components/value-card.js';
export { RoleCard, type RoleCardProps, type RoleCardTone } from './components/role-card.js';
export { SiteTopbar, type SiteTopbarLink, type SiteTopbarProps } from './components/site-topbar.js';
export {
  PITCH_SPOTS,
  PitchPositions,
  RingChart,
  SERIES_TONES,
  Sparkline,
  StatTile,
  sparklinePoints,
  type PitchPositionsProps,
  type PitchSpot,
  type RingChartProps,
  type RingSegment,
  type SeriesTone,
  type SparklineProps,
  type StatTileProps,
} from './components/stats.js';
export {
  AdSlot,
  MediaFrame,
  type AdFormat,
  type AdSlotProps,
  type MediaFrameProps,
  type MediaRatio,
} from './components/media-frame.js';
export {
  SPORTS,
  SportGlyph,
  SportIcon,
  SportTag,
  type Sport,
  type SportIconProps,
  type SportTagProps,
} from './components/sport-icon.js';
export {
  ClubCrest,
  crestInitials,
  crestPalette,
  type ClubCrestProps,
  type CrestPalette,
} from './components/club-crest.js';
export { SportLoader, type SportLoaderProps } from './components/sport-loader.js';
export { DetailPanel, type DetailPanelProps } from './components/detail-panel.js';
