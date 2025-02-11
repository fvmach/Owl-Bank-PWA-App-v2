import * as React from "react";
import { render, axe } from "reakit-test-utils";
import ButtonWithTooltip from "..";

test("a11y", async () => {
  const { baseElement } = render(<ButtonWithTooltip />);
  expect(await axe(baseElement)).toHaveNoViolations();
});
