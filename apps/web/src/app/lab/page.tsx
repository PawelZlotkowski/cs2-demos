"use client";

import { useEffect } from "react";

/** The Lab moved into the admin panel (doc 30 §5.1); old links keep working. */
export default function LabMoved() {
  useEffect(() => {
    window.location.replace(`/admin/lab${window.location.search}${window.location.hash}`);
  }, []);
  return <main className="main" id="content" aria-busy="true" />;
}
