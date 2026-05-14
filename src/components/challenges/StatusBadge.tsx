import { Badge } from "@/components/ui/badge";
import {
  challengeStatusLabel,
  participantStatusLabel,
  type ChallengeStatus,
  type ParticipantStatus,
} from "@/types/challenges";

type Variant = "success" | "warning" | "destructive" | "secondary" | "outline" | "default";

function challengeVariant(status: ChallengeStatus): Variant {
  switch (status) {
    case "draft":
      return "outline";
    case "open_registration":
      return "warning";
    case "running":
    case "measuring_t1":
      return "default";
    case "closed":
      return "success";
    case "cancelled":
      return "secondary";
  }
}

function participantVariant(status: ParticipantStatus): Variant {
  switch (status) {
    case "registered":
      return "outline";
    case "active":
      return "success";
    case "disqualified":
      return "destructive";
    case "completed":
      return "secondary";
    case "withdrew":
      return "secondary";
  }
}

export function ChallengeStatusBadge({ status }: { status: ChallengeStatus }) {
  return <Badge variant={challengeVariant(status)}>{challengeStatusLabel(status)}</Badge>;
}

export function ParticipantStatusBadge({ status }: { status: ParticipantStatus }) {
  return <Badge variant={participantVariant(status)}>{participantStatusLabel(status)}</Badge>;
}
