/**
 * A translated sentence with its emphasis inside it: "**Only you can move
 * it** — Hyperider never can." Word order differs by language, so the bold
 * part travels with the translation instead of being glued on in JSX.
 * `classes` styles successive emphasised parts in turn (first, second, …).
 */
import { Fragment } from "react";

export default function Rich({ text, className = "text-bone", classes }: { text: string; className?: string; classes?: string[] }) {
  const parts = text.split("**");
  const cls = classes?.length ? classes : [className];
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <b key={i} className={cls[((i - 1) / 2) % cls.length]}>
            {p}
          </b>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
