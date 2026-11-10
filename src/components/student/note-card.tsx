import { PaperCard } from "@/components/student/paper-card";
import type { PaperCardProps } from "@/components/student/paper-card";

export type NoteCardProps = Omit<PaperCardProps, "variant">;

export function NoteCard(props: NoteCardProps) {
    return <PaperCard {...props} variant="note" />;
}
