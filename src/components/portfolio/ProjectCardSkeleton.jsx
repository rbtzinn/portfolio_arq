import React from "react";

export default function ProjectCardSkeleton() {
  return (
    <div className="relative overflow-hidden aspect-[4/5] bg-stone-200 rounded-sm">
      <div className="absolute inset-0 animate-pulse">
        <div className="h-full w-full bg-stone-200" />
        <div className="absolute inset-x-0 bottom-0 p-8">
          <div className="h-3 w-24 bg-stone-300/80 rounded mb-3" />
          <div className="h-6 w-44 bg-stone-300/80 rounded" />
        </div>
      </div>
    </div>
  );
}
