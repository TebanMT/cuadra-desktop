import { DayPicker, type DayPickerProps } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import "./calendar.css";
import { cn } from "@/lib/utils";

export function Calendar({ className, ...props }: DayPickerProps) {
  return <DayPicker locale={es} weekStartsOn={1} captionLayout="dropdown" navLayout="after"
    showOutsideDays fixedWeeks className={cn("tinta-calendar", className)} {...props} />;
}
