import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HeartIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20Z" />
    </Icon>
  );
}

export function BookmarkIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M6 4h12v16l-6-4-6 4V4Z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </Icon>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-5.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    </Icon>
  );
}
