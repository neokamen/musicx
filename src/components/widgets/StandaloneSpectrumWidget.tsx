import React from "react";
import { SpectrumVisualizer } from "./SpectrumVisualizer.tsx";

export interface StandaloneSpectrumWidgetProps {
  nodeKey?: string;
  isEditing?: boolean;
}

export const StandaloneSpectrumWidget: React.FC<StandaloneSpectrumWidgetProps> = ({ nodeKey, isEditing }) => {
  return (
    <div className="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs">
      <div className="flex-1 flex flex-col justify-end bg-slate-950 relative overflow-hidden">
        <SpectrumVisualizer nodeKey={nodeKey} isEditing={isEditing} />
      </div>
    </div>
  );
};
