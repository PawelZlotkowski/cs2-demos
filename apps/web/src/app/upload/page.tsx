"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { FolderFront, FolderShape, PlusIcon } from "@/components/review/MatchFolders";
import { UploadStatusIsland } from "@/components/StatusIsland";
import { api } from "@/lib/api/client";
import { bytes } from "@/lib/format";

export default function UploadPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const transfer = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => transfer.current?.abort(), []);

  async function upload(files: FileList) {
    if (!files.length || transfer.current) return;
    const demo = files[0];
    if (files.length !== 1 || !/\.dem(?:\.zst)?$/i.test(demo.name) || demo.size === 0) {
      setError(files.length !== 1 ? "Choose one demo at a time." : !demo.size
        ? "This file is empty. Choose the original .dem or .dem.zst."
        : `${demo.name} is not a demo. Choose a .dem from CS Demo Manager or a .dem.zst from FACEIT.`);
      return;
    }
    const controller = new AbortController();
    transfer.current = controller;
    setError("");
    setFile(demo);
    setPercent(null);
    try {
      const match = await api.upload(demo, (loaded, total) => {
        setPercent(Math.floor(100 * loaded / total));
      }, controller.signal);
      if (!controller.signal.aborted) router.push("/processing/" + encodeURIComponent(match.id));
    } catch (e) {
      if (controller.signal.aborted) return;
      transfer.current = null;
      setFile(null);
      setError(e instanceof Error ? e.message : "The upload stopped. Choose the demo to try again.");
    }
  }

  function dragOver(e: DragEvent<HTMLElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = transfer.current ? "none" : "copy";
    setOver(!transfer.current);
  }

  return <main id="content" className="main demo-upload">
    <FolderShape />
    <section className="match-folder drop-folder" aria-labelledby="drop-title" data-over={over || undefined}
      onDragOver={dragOver}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}>
      <div className="drop-pane">
        <FolderFront />
        <span className="folder-tab">New match</span>
        <div className="drop-content">
          <h1 id="drop-title">{percent === 100 && file ? "Waiting for processing" : file ? "Adding your match" : "Drop a demo to review it"}</h1>
          <p className="drop-formats">{file ? bytes(file.size) + " demo" : "Choose an Ancient or Anubis demo. Use a .dem from CS Demo Manager or a .dem.zst from FACEIT."}</p>
          {error && <p className="drop-error" role="alert">{error}</p>}
          {file ? <UploadStatusIsland filename={file.name} percent={percent} /> :
            <button type="button" className="btn btn-fill choose-demo" onClick={() => input.current?.click()}>
              <span aria-hidden="true"><PlusIcon /></span>Choose file
            </button>}
          {/* macOS pickers match only the last extension, so ".dem.zst" must be ".zst"; upload() checks the full name */}
          <input ref={input} type="file" hidden disabled={!!file} accept=".dem,.zst"
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files);
              e.target.value = "";
            }} />
        </div>
      </div>
    </section>
  </main>;
}
