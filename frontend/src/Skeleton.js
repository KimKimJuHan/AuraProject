// /frontend/src/Skeleton.js
import React from "react";

export default function Skeleton({ height = "200px", style }) {
  return (
    <div
      className="net-card net-card--skel"
      style={{ height, borderRadius: "4px", ...style }}
    />
  );
}