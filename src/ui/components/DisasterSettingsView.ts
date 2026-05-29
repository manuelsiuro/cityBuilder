import { Container, Graphics, Text } from "pixi.js";
import {
  DISASTER_IDS,
  DISASTER_LABELS,
  FREQUENCY_STEPS,
  type DisasterId,
  type DisasterSettings,
} from "../../sim/MapSettings";

const FONT = "ui-sans-serif, system-ui, sans-serif";
const ROW_H = 32;
const ROW_GAP = 4;
const SECTION_GAP = 16;

/**
 * A small standalone Pixi view that renders the disaster-settings widgets:
 * one toggle per disaster, plus a 4-step frequency segmented control. Shared
 * by `MainMenu` (new-city flow) and `SettingsPanel` (in-game).
 *
 * The view owns its own re-render — the caller passes the current settings
 * in `render()` and receives `onChange` callbacks. The view never mutates
 * its input directly.
 */
export class DisasterSettingsView {
  readonly container = new Container();

  constructor(
    private width: number,
    private readonly onChange: (next: DisasterSettings) => void,
  ) {}

  setWidth(width: number): void {
    this.width = width;
  }

  /** Compute the height the view will take at the current settings. */
  get height(): number {
    return (
      DISASTER_IDS.length * (ROW_H + ROW_GAP) - ROW_GAP +
      SECTION_GAP + 22 + ROW_H
    );
  }

  render(settings: DisasterSettings): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    // --- Per-disaster toggle rows ---
    DISASTER_IDS.forEach((id, i) => {
      const y = i * (ROW_H + ROW_GAP);
      this.drawToggleRow(id, settings.enabled[id], y, () => {
        const enabled = { ...settings.enabled, [id]: !settings.enabled[id] };
        this.onChange({ ...settings, enabled });
      });
    });

    // --- Frequency stepper ---
    const freqY = DISASTER_IDS.length * (ROW_H + ROW_GAP) + SECTION_GAP;
    const label = new Text({
      text: "Disaster frequency",
      style: { fill: 0xb6bfca, fontSize: 13, fontFamily: FONT, fontWeight: "500" },
    });
    label.position.set(0, freqY);
    this.container.addChild(label);

    const stepperY = freqY + 22;
    const stepW = (this.width - (FREQUENCY_STEPS.length - 1) * 6) / FREQUENCY_STEPS.length;
    FREQUENCY_STEPS.forEach((step, i) => {
      const x = i * (stepW + 6);
      const selected = Math.abs(step - settings.frequency) < 0.001;
      this.drawStepButton(x, stepperY, stepW, ROW_H, `${step}×`, selected, () => {
        this.onChange({ ...settings, frequency: step });
      });
    });
  }

  private drawToggleRow(
    id: DisasterId,
    on: boolean,
    y: number,
    onTap: () => void,
  ): void {
    const row = new Graphics()
      .roundRect(0, y, this.width, ROW_H, 8)
      .fill({ color: on ? 0x213341 : 0x1c2028, alpha: 0.95 })
      .stroke({ width: 1.2, color: on ? 0x4a90c2 : 0x3a4250 });
    row.eventMode = "static";
    row.cursor = "pointer";
    row.on("pointertap", onTap);
    this.container.addChild(row);

    const labelText = new Text({
      text: DISASTER_LABELS[id],
      style: {
        fill: 0xeef2f6,
        fontSize: 13,
        fontFamily: FONT,
        fontWeight: "600",
      },
    });
    labelText.anchor.set(0, 0.5);
    labelText.position.set(12, y + ROW_H / 2);
    labelText.eventMode = "none";
    this.container.addChild(labelText);

    // A simple pill on the right: ON in blue, OFF in grey.
    const pillW = 44, pillH = 20;
    const pillX = this.width - pillW - 10;
    const pillY = y + (ROW_H - pillH) / 2;
    const pill = new Graphics()
      .roundRect(pillX, pillY, pillW, pillH, 10)
      .fill({ color: on ? 0x2b6cb0 : 0x33384a });
    pill.eventMode = "none";
    this.container.addChild(pill);

    const pillText = new Text({
      text: on ? "ON" : "OFF",
      style: {
        fill: 0xeef2f6,
        fontSize: 11,
        fontFamily: FONT,
        fontWeight: "700",
      },
    });
    pillText.anchor.set(0.5);
    pillText.position.set(pillX + pillW / 2, pillY + pillH / 2);
    pillText.eventMode = "none";
    this.container.addChild(pillText);
  }

  private drawStepButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    selected: boolean,
    onTap: () => void,
  ): void {
    const g = new Graphics()
      .roundRect(x, y, w, h, 8)
      .fill({ color: selected ? 0x2b6cb0 : 0x222833, alpha: 0.95 })
      .stroke({ width: 1.5, color: selected ? 0x4a90c2 : 0x3a4250 });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.on("pointertap", onTap);
    this.container.addChild(g);

    const t = new Text({
      text: label,
      style: {
        fill: 0xeef2f6,
        fontSize: 13,
        fontFamily: FONT,
        fontWeight: selected ? "700" : "600",
      },
    });
    t.anchor.set(0.5);
    t.position.set(x + w / 2, y + h / 2);
    t.eventMode = "none";
    this.container.addChild(t);
  }
}
