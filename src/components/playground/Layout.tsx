import styled from "styled-components";
import type { SectionSize } from "./usePlaygroundController";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
  overflow: hidden;
`;

export const Header = styled.div`
  background: #252526;
  padding: 12px 16px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
`;

export const HeaderTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;

  a {
    color: #ffffff;
    text-decoration: none;
  }
`;

export const SectionHeader = styled.div<{ $collapsed?: boolean; $sideways?: boolean }>`
  background: #2d2d30;
  padding: 0.25em 0.6em;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #cccccc;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: #333336;
  }

  @media (min-width: 768px) {
    writing-mode: ${(props) => (props.$sideways ? "sideways-lr;" : "unset")};
  }
`;

export const ToggleBtn = styled.button`
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const SizeControls = styled.div`
  display: flex;
  gap: 4px;
  margin-left: 8px;
`;

export const SizeBtn = styled.button<{ $active?: boolean }>`
  background: ${(props) => (props.$active ? "#0e639c" : "transparent")};
  border: 1px solid ${(props) => (props.$active ? "#0e639c" : "#505053")};
  color: ${(props) => (props.$active ? "#ffffff" : "#cccccc")};
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  min-width: 24px;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => (props.$active ? "#0e639c" : "#3e3e42")};
    border-color: #0e639c;
  }
`;

export const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export const SettingsPanel = styled.div<{ $collapsed?: boolean }>`
  background: #252526;
  padding: 0.3em;
  border-bottom: 1px solid #3e3e42;
  display: ${(props) => (props.$collapsed ? "none" : "flex")};
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
`;

export const SettingsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;

  label {
    font-size: 12px;
    color: #cccccc;
    white-space: nowrap;
  }
`;

export const SettingsInput = styled.input`
  flex: 1;
  background: #3e3e42;
  color: #d4d4d4;
  border: 1px solid #505053;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #0e639c;
  }
`;

export const SettingsSelect = styled.select`
  flex: 1;
  background: #3e3e42;
  color: #d4d4d4;
  border: 1px solid #505053;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #0e639c;
  }
`;

export const TabBar = styled.div`
  display: flex;
  gap: 2px;
  background: #2d2d30;
  padding: 4px;
  overflow-x: auto;
  border-bottom: 1px solid #3e3e42;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 3px;
  }
`;

export const Tab = styled.div<{ $active?: boolean }>`
  background: ${(props) => (props.$active ? "#1e1e1e" : "#252526")};
  color: ${(props) => (props.$active ? "#ffffff" : "#cccccc")};
  padding: 6px 12px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 13px;
  border: 1px solid ${(props) => (props.$active ? "#3e3e42" : "transparent")};
  border-bottom: none;

  &:hover {
    background: ${(props) => (props.$active ? "#1e1e1e" : "#2a2d2e")};
  }
`;

export const TabName = styled.span`
  flex: 1;
`;

export const TabCloseBtn = styled.button`
  background: transparent;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 3px;

  &:hover {
    background: #3e3e42;
    color: #ffffff;
  }
`;

export const SaveButton = styled.button`
  background: #0e639c;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  transition: all 0.2s ease;

  &:hover {
    background: #1177bb;
  }
`;

export const MainContainer = styled.div<{ $collapsed?: boolean }>`
  display: grid;
  grid-template-columns: ${(props) => (props.$collapsed ? "1fr" : "1fr 1fr")};
  flex: 1;
  overflow: hidden;
  transition: grid-template-columns 0.3s ease;
`;

export const Section = styled.div<{ $collapsed?: boolean; $size?: SectionSize; $borderRight?: boolean }>`
  display: ${(props) => (props.$collapsed ? "none" : "flex")};
  flex-direction: column;
  overflow: hidden;
  border-right: ${(props) => (props.$borderRight ? "1px solid #3e3e42" : "none")};
  flex-basis: ${(props) => {
    if (props.$collapsed) return "0";
    switch (props.$size) {
      case "small":
        return "20%";
      case "big":
        return "80%";
      case "medium":
      default:
        return "50%";
    }
  }};
`;

export const SectionContent = styled.div<{ $collapsed?: boolean }>`
  flex: 1;
  overflow: ${(props) => (props.$collapsed ? "hidden" : "auto")};
`;

export const EditorSection = Section;
export const OutputSection = Section;
export const ExecutionSection = Section;

export const EditorContainer = styled.div`
  height: 100%;
  min-height: 400px;
`;
