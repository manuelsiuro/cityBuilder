import { Container, Graphics, Text } from "pixi.js";
import type { SlotMeta } from "../../save/SaveSystem";
import { SaveSlotList, type SlotRow } from "./SaveSlotList";

const FONT = "ui-sans-serif, system-ui, sans-serif";
const PANEL_W = 560;
const PAD = 28;
/** Numbered slots offered for saving (0–5). */
const SLOT_COUNT = 6;

export type PanelMode = "save" | "load";

export interface SaveLoadCallbacks {
  /** Slot + metadata for every saved city. */
  listMetas: () => Promise<SlotMeta[]>;
  /** Save the current city into `slot` under `name`. */
  onSaveToSlot: (slot: number, name: string) => void;
  /** Load the city stored in `slot`. */
  onLoadSlot: (slot: number) => void;
  /** Download the current city as a `.json` file named `name`. */
  onExportFile: (name: string) => void;
  /** Import a `.json` save file chosen from disk. */
  onImportFile: (file: File) => void;
}

/**
 * Full-screen modal for saving and loading cities mid-game. In `save` mode it
 * shows all numbered slots plus a city-name field and a file-export button; in
 * `load` mode it lists the saved cities plus a file-import button. The card
 * list is rendered by the shared `SaveSlotList`.
 */
export class SaveLoadPanel {
  readonly container = new Container();

  private mode: PanelMode = "load";
  private rows: SlotRow[] = [];
  private screenW = window.innerWidth;
  private screenH = window.innerHeight;
  private lastName = "My City";

  /** HTML name field, shown only in save mode (PixiJS has no text input). */
  private readonly nameInput: HTMLInputElement;
  private readonly fileInput: HTMLInputElement;

  constructor(
    private readonly cb: SaveLoadCallbacks,
    private readonly onClose: () => void,
  ) {
    this.container.visible = false;
    this.container.eventMode = "static";

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.maxLength = 28;
    this.nameInput.style.cssText =
      "position:fixed;display:none;z-index:20;box-sizing:border-box;" +
      "font:600 14px ui-sans-serif,system-ui,sans-serif;color:#eef2f6;" +
      "background:#0c0f14;border:1.5px solid #3a4250;border-radius:8px;" +
      "padding:0 12px;outline:none;";
    document.body.appendChild(this.nameInput);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = "application/json,.json";
    this.fileInput.style.display = "none";
    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = "";
      if (file) this.cb.onImportFile(file);
    });
    document.body.appendChild(this.fileInput);
  }

  /** Open the panel in the given mode and (re)load the slot list. */
  open(mode: PanelMode): void {
    this.mode = mode;
    this.container.visible = true;
    this.rows = mode === "save" ? emptyRows() : [];
    this.render();
    this.cb
      .listMetas()
      .then((metas) => {
        this.rows = mode === "save" ? mergeRows(metas) : metas.map((m) => ({ ...m }));
        if (this.container.visible) this.render();
      })
      .catch(() => { /* keep what we have */ });
  }

  close(): void {
    this.container.visible = false;
    this.nameInput.style.display = "none";
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    if (this.container.visible) this.render();
  }

  // --- Internals -------------------------------------------------------

  private pickSlot(slot: number): void {
    if (this.mode === "load") {
      this.cb.onLoadSlot(slot);
      return;
    }
    const occupied = this.rows.find((r) => r.slot === slot)?.meta;
    if (occupied && !window.confirm(`Overwrite "${occupied.name}" in slot ${slot}?`)) return;
    const name = this.currentName();
    this.cb.onSaveToSlot(slot, name);
  }

  private currentName(): string {
    const v = this.nameInput.value.trim();
    if (v) this.lastName = v;
    return this.lastName;
  }

  private get panelH(): number {
    const listH = SaveSlotList.heightFor(this.rows.length);
    const headerH = this.mode === "save" ? 130 : 84;
    return headerH + listH + 84;
  }

  private get panelX(): number {
    return Math.round((this.screenW - PANEL_W) / 2);
  }

  private get panelY(): number {
    return Math.round((this.screenH - this.panelH) / 2);
  }

  private render(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    const px = this.panelX;
    const py = this.panelY;
    const ph = this.panelH;

    this.container.addChild(
      new Graphics()
        .rect(0, 0, this.screenW, this.screenH)
        .fill({ color: 0x0b0f14, alpha: 0.82 }),
    );
    this.container.addChild(
      new Graphics()
        .roundRect(px, py, PANEL_W, ph, 16)
        .fill({ color: 0x161a20, alpha: 0.98 })
        .stroke({ width: 2, color: 0x39414d }),
    );

    this.addText(this.mode === "save" ? "Save City" : "Load City",
      px + PANEL_W / 2, py + 34, { size: 24, weight: "800", color: 0xeef2f6 });

    let listY = py + 64;

    if (this.mode === "save") {
      this.addText("City name", px + PAD, py + 64,
        { size: 13, color: 0xb6bfca, anchorX: 0 });
      this.positionNameInput(px + PAD, py + 82, PANEL_W - PAD * 2, 38);
      listY = py + 138;
    } else {
      this.nameInput.style.display = "none";
    }

    // A fresh list each render — the panel rebuild destroys all its children.
    const list = new SaveSlotList(PANEL_W - PAD * 2, (slot) => this.pickSlot(slot));
    list.container.position.set(px + PAD, listY);
    list.render(this.rows);
    this.container.addChild(list.container);

    const footerY = listY + SaveSlotList.heightFor(this.rows.length) + 22 + 26;
    const fileLabel = this.mode === "save" ? "Download to file" : "Load from file…";
    this.addButton(fileLabel, px + PAD + 110, footerY, 220, 48, () => {
      if (this.mode === "save") this.cb.onExportFile(this.currentName());
      else this.fileInput.click();
    });
    this.addButton("Cancel", px + PANEL_W - PAD - 80, footerY, 160, 48,
      () => this.onClose());
  }

  private positionNameInput(x: number, y: number, w: number, h: number): void {
    if (!this.nameInput.value) this.nameInput.value = this.lastName;
    const s = this.nameInput.style;
    s.display = "block";
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
  }

  private addButton(
    label: string, cx: number, cy: number, w: number, h: number, onClick: () => void,
  ): void {
    const g = new Graphics()
      .roundRect(cx - w / 2, cy - h / 2, w, h, 10)
      .fill(0x222833)
      .stroke({ width: 1.5, color: 0x3a4250 });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.on("pointertap", onClick);
    this.container.addChild(g);

    const t = new Text({
      text: label,
      style: { fill: 0xeef2f6, fontSize: 14, fontFamily: FONT, fontWeight: "600" },
    });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    t.eventMode = "none";
    this.container.addChild(t);
  }

  private addText(
    text: string, x: number, y: number,
    opts: { size: number; color: number; weight?: string; anchorX?: number },
  ): void {
    const t = new Text({
      text,
      style: {
        fill: opts.color,
        fontSize: opts.size,
        fontFamily: FONT,
        fontWeight: (opts.weight ?? "500") as Text["style"]["fontWeight"],
      },
    });
    t.anchor.set(opts.anchorX ?? 0.5, 0.5);
    t.position.set(x, y);
    t.eventMode = "none";
    this.container.addChild(t);
  }
}

/** All numbered slots as empty rows — the save-mode skeleton before metas load. */
function emptyRows(): SlotRow[] {
  return Array.from({ length: SLOT_COUNT }, (_, slot) => ({ slot }));
}

/** Overlay saved metadata onto the fixed slot grid for save mode. */
function mergeRows(metas: SlotMeta[]): SlotRow[] {
  return emptyRows().map((row) => {
    const hit = metas.find((m) => m.slot === row.slot);
    return hit ? { slot: row.slot, meta: hit.meta } : row;
  });
}
