import { LibraryIcon } from "@/shared/ui/icons";
import { IconButton } from "@/shared/ui/icon-button";

export function LibraryToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <IconButton className="md:hidden" label={open ? "録音一覧を閉じる" : "録音一覧"} pressed={open} onClick={onToggle}>
      <LibraryIcon />
    </IconButton>
  );
}
