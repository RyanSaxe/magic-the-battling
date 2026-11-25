// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { FloatingWindow } from "./FloatingWindow";

function Guide() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <FloatingWindow
      name="guide"
      title="Guide"
      collapsed={collapsed}
      collapsedCaption="Current section"
      collapsedText="Fight"
      draggable={false}
      dragging={false}
      onDragStart={() => {}}
      onMinimize={() => setCollapsed(true)}
      onRestore={() => setCollapsed(false)}
      onClose={() => {}}
      instant={false}
      style={{}}
    >
      <Sections />
    </FloatingWindow>
  );
}

function Sections() {
  const [section, setSection] = useState("Overview");
  return <button onClick={() => setSection("Fight")}>Reading {section}</button>;
}

afterEach(cleanup);

it("opens a minimized window where it was left", () => {
  render(<Guide />);

  fireEvent.click(screen.getByText("Reading Overview"));
  fireEvent.click(screen.getByLabelText("Minimize guide"));
  fireEvent.click(screen.getByLabelText("Open guide"));

  expect(screen.queryByText("Reading Fight")).not.toBeNull();
});
