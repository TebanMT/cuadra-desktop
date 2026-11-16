import { createElement, useEffect, type ComponentType } from "react";
import type { CashDrawerField } from "@/components/cash/CashDrawerField";

type Props = React.ComponentProps<typeof CashDrawerField>;
// Existing financial unit tests isolate drawer lookup. Model its confirmed
// state explicitly; lookup failures are covered by the real field tests.
export function withReadyCashMock(mock: { CashDrawerField: ComponentType<Props> }) {
  const Field = mock.CashDrawerField;
  return { CashDrawerField: function ReadyCashDrawer(props: Props) {
    const { onReadyChange } = props;
    useEffect(() => { onReadyChange?.(true); }, [onReadyChange]);
    return createElement(Field, props);
  } };
}
