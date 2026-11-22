import { useState } from "react";
import { cn } from "@/lib/utils";

function usernameGradient(username: string) {
  let palette = 2166136261;
  let layout = 5381;
  for (const character of username.toLowerCase()) {
    const code = character.charCodeAt(0);
    palette = Math.imul(palette ^ code, 16777619);
    layout = Math.imul(layout, 33) ^ code;
  }

  const color = (palette >>> 0) % 360;
  const accent = (color + 45 + ((palette >>> 12) % 75)) % 360;
  const angle = (layout >>> 0) % 360;
  const x = 18 + ((layout >>> 8) % 65);
  const y = 18 + ((layout >>> 16) % 65);

  return `radial-gradient(circle at ${x}% ${y}%, hsl(${accent} 75% 40% / .72), transparent 65%), linear-gradient(${angle}deg, hsl(${color} 65% 25%), hsl(${accent} 66% 37%))`;
}

export function ProfileAvatar({
  username,
  avatarUrl,
  className,
}: {
  username: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white",
        className,
      )}
      style={{ backgroundImage: usernameGradient(username ?? "") }}
    >
      <span className="drop-shadow-sm">{username?.[0]?.toUpperCase()}</span>
      {avatarUrl && failedUrl !== avatarUrl && (
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full bg-muted object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      )}
    </span>
  );
}
