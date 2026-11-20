import React from "react";
import { playTick } from "../sound";

export interface TabOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string = string> {
  tabs: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string = string>({ tabs, value, onChange, className = "" }: TabsProps<T>) {
  return (
    <div className={`tw-tabs ${className}`} role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className="tw-tab"
            onClick={() => {
              playTick("click");
              onChange(tab.id);
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
