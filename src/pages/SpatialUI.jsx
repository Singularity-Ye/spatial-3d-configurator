import React, { useState, useRef, Suspense, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Preload, OrbitControls, Line, Html, useGLTF, Grid, Environment, Sparkles } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useHandTracking, TRACKING_MODES } from '../utils/useHandTracking';
import ErrorBoundary from '../components/ErrorBoundary';
import HandHologram from '../components/HeroSection3D/HandHologram';

// Check if safe gesture test mode is enabled via URL search parameter
const isSafeMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('safeGesture') === '1';

// WebGL crash logging blackbox helper
function pushCrashLog(type, payload = {}) {
  try {
    const key = 'spatial_webgl_crash_logs';
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    const item = {
      time: new Date().toISOString(),
      type,
      payload,
    };
    localStorage.setItem(key, JSON.stringify([...prev, item].slice(-80)));
  } catch (e) {
    console.error('Failed to write crash log:', e);
  }
}

const DebugModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
`;

const DebugModalContent = styled.div`
  width: 100%;
  max-width: 800px;
  max-height: 80vh;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  border: 1px solid rgba(231, 199, 126, 0.25);
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  color: #f1f5f9;
  font-family: monospace;

  .debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.2rem;
    border-bottom: 1px solid rgba(231, 199, 126, 0.15);
    
    h2 {
      font-size: 1.15rem;
      margin: 0;
      color: #e7c77e;
    }
    
    .close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.8rem;
      cursor: pointer;
      line-height: 1;
      padding: 0;
      &:hover { color: #f1f5f9; }
    }
  }

  .debug-actions {
    display: flex;
    gap: 0.8rem;
    padding: 0.8rem 1.2rem;
    background: rgba(15, 23, 42, 0.4);
    border-bottom: 1px solid rgba(231, 199, 126, 0.1);
    
    .btn-action {
      background: rgba(231, 199, 126, 0.08);
      border: 1px solid rgba(231, 199, 126, 0.25);
      color: #e7c77e;
      padding: 0.4rem 0.8rem;
      border-radius: 4px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        background: rgba(231, 199, 126, 0.15);
        border-color: rgba(231, 199, 126, 0.4);
      }
      &.btn-secondary {
        border-color: rgba(239, 68, 68, 0.4);
        color: #f87171;
        background: rgba(239, 68, 68, 0.05);
        &:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.6);
        }
      }
    }
  }

  .debug-list {
    flex: 1;
    overflow-y: auto;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    
    .empty-log {
      text-align: center;
      color: #64748b;
      padding: 3rem 0;
    }
    
    .debug-item {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 6px;
      padding: 0.8rem;
      
      .debug-time {
        font-size: 0.75rem;
        color: #64748b;
      }
      
      .debug-type {
        font-weight: bold;
        color: #38bdf8;
        margin: 0.2rem 0;
      }
      
      .debug-payload {
        margin: 0.4rem 0 0 0;
        font-size: 0.75rem;
        color: #cbd5e1;
        white-space: pre-wrap;
        word-break: break-all;
        background: rgba(15, 23, 42, 0.8);
        padding: 0.6rem;
        border-radius: 4px;
        border: 1px solid rgba(148, 163, 184, 0.05);
      }
    }
  }
`;

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  color: #1e293b;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 2rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(16px);
  z-index: 10;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03), 0 1px 2px rgba(15, 23, 42, 0.06);

  .logo-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;

    .icon {
      font-size: 1.3rem;
    }

    h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #0f172a;
    }
  }

  .nav-back {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.12);
    color: #475569;
    padding: 0.45rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.02em;

    &:hover {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.2);
      color: #0f172a;
    }
  }
`;

const MainContent = styled.main`
  flex: 1;
  position: relative;
  display: flex;
  z-index: 1;
  height: calc(100vh - 65px);

  @media (max-width: 968px) {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
  }
`;

const Sidebar = styled.section`
  position: absolute;
  top: 1.5rem;
  bottom: 1.5rem;
  ${props => props.$left ? 'left: 1.5rem;' : 'right: 1.5rem;'}
  width: 298px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;
  
  /* Scrollable behavior to prevent card truncation */
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.24);
  }

  ${props => props.$collapsed && (props.$left ? 'transform: translateX(-340px); opacity: 0; pointer-events: none;' : 'transform: translateX(340px); opacity: 0; pointer-events: none;')}

  @media (max-width: 968px) {
    position: relative;
    left: auto;
    right: auto;
    top: auto;
    bottom: auto;
    width: 100%;
    height: auto;
    margin-bottom: 1rem;
    overflow-y: visible;
    padding-right: 0;
    ${props => props.$collapsed && 'display: none;'}
  }

  .btn-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  button.option {
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid rgba(0, 0, 0, 0.06);
    color: #475569;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(37, 99, 235, 0.05);
      border-color: rgba(37, 99, 235, 0.3);
      color: #1e293b;
    }

    &.active {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
    }
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    label {
      font-size: 0.7rem;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }

    input[type='range'] {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.08);
      outline: none;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #2563eb;
        cursor: pointer;
        transition: transform 0.1s;

        &:hover {
          transform: scale(1.2);
        }
      }
    }
  }

  .tech-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #64748b;
    line-height: 1.45;
  }
`;

const CanvasContainer = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${props => props.$leftCollapsed ? '0' : '320px'};
  right: ${props => props.$rightCollapsed ? '0' : '320px'};
  transition: left 0.5s cubic-bezier(0.16, 1, 0.3, 1), right 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  z-index: 1;

  @media (max-width: 968px) {
    position: relative;
    left: 0 !important;
    right: 0 !important;
    height: 500px;
  }

  .pip-instructions {
    position: absolute;
    bottom: 5.5rem; /* Raised to prevent BottomDock overlapping and blocking vision */
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    padding: 0.6rem 1rem;
    font-size: 0.72rem;
    color: #334155;
    pointer-events: none;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
    white-space: nowrap;
    z-index: 5;
  }
`;

const HudCard = styled.div`
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04), 0 12px 30px rgba(15, 23, 42, 0.06);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  flex-shrink: 0; /* Prevent flex compression, keeping natural fitting heights */

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.35), transparent);
    opacity: 0.7;
  }

  &:hover {
    border-color: rgba(37, 99, 235, 0.25);
    box-shadow: 0 6px 24px rgba(15, 23, 42, 0.05), 0 16px 36px rgba(15, 23, 42, 0.08);
    &::before {
      background: linear-gradient(90deg, transparent, #2563eb, transparent);
      opacity: 1;
    }
  }

  h3 {
    font-size: 0.8rem;
    font-weight: 700;
    color: #0f172a;
    border-left: 3px solid #2563eb;
    padding-left: 0.5rem;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .tech-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #475569;
    line-height: 1.45;
  }

  /* Progress bar styles */
  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.2rem;
  }

  .progress-bar-fill {
    height: 100%;
    background: #2563eb;
  }

  /* Sparkline row style */
  .sparkline-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
    font-family: 'JetBrains Mono', monospace;
    color: #475569;
  }
`;

// Tag and Hotspot styled label
const TagLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: ${props => props.$selected ? '#2563eb' : 'rgba(255, 255, 255, 0.92)'};
  border: 1px solid ${props => props.$selected ? '#2563eb' : 'rgba(0, 0, 0, 0.08)'};
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  color: ${props => props.$selected ? '#ffffff' : '#1e293b'};
  font-family: 'Outfit', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  pointer-events: auto;
  transition: all 0.2s ease;
  user-select: none;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);

  &:hover {
    background: ${props => props.$selected ? '#1d4ed8' : '#f8fafc'};
    border-color: ${props => props.$selected ? '#1d4ed8' : 'rgba(0, 0, 0, 0.15)'};
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  }

  .num {
    color: ${props => props.$selected ? '#fff' : '#2563eb'};
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
  }
`;

const EdgeTab = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${props => props.$left ? `left: ${props.$collapsed ? '0' : '305px'}; border-radius: 0 8px 8px 0;` : `right: ${props.$collapsed ? '0' : '305px'}; border-radius: 8px 0 0 8px;`}
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  ${props => props.$left ? 'border-left: none;' : 'border-right: none;'}
  color: #475569;
  font-family: 'Outfit', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1.2rem 0.4rem;
  writing-mode: vertical-lr;
  cursor: pointer;
  z-index: 10;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);

  &:hover {
    background: #f8fafc;
    color: #2563eb;
    border-color: rgba(37, 99, 235, 0.3);
  }

  @media (max-width: 968px) {
    display: none;
  }
`;

const DetailTooltip = styled.div`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: ${props => props.$visible ? 'translate(-50%, 6px)' : 'translate(-50%, 16px)'};
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
  border-radius: 6px;
  padding: 0.5rem;
  color: #1e293b;
  font-family: 'Outfit', sans-serif;
  width: 190px;
  white-space: normal;
  pointer-events: none;
  z-index: 100;
  backdrop-filter: blur(10px);
  opacity: ${props => props.$visible ? 1 : 0};
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  .tooltip-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: #2563eb;
    margin-bottom: 0.3rem;
    display: flex;
    justify-content: space-between;
    font-family: 'Outfit', sans-serif;
    letter-spacing: 0.02em;
  }
  .tooltip-desc {
    font-size: 0.68rem;
    color: #334155;
    line-height: 1.5;
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: .3s;
    border-radius: 20px;
  }
  
  span:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
  }
  
  input:checked + span {
    background-color: #2563eb;
  }
  
  input:checked + span:before {
    transform: translateX(16px);
  }
`;

const SpecTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.4rem;
  font-size: 0.7rem;
`;

const SpecRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  
  .label {
    color: #64748b;
  }
  
  .val {
    color: #0f172a;
    font-weight: 500;
  }
`;

const SearchInput = styled.div`
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  gap: 0.4rem;
  
  input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.7rem;
    color: #1e293b;
    width: 100%;
    
    &::placeholder {
      color: #94a3b8;
    }
  }
`;

const PartThumbnail = styled.div`
  width: 100%;
  height: 80px;
  background: rgba(0, 0, 0, 0.01);
  border: 1px dashed rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: #94a3b8;
  margin: 0.2rem 0;
`;

const HeaderButton = styled.button`
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  border-radius: 6px;
  color: #334155;
  padding: 0.45rem 0.9rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  transition: all 0.2s ease;

  &:hover {
    background: #f8fafc;
    border-color: rgba(0, 0, 0, 0.15);
    color: #0f172a;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.05);
  }
`;

// Refrigerator parts metadata
const FRIDGE_PARTS = {
  '01': {
    id: 'RF-FC-001',
    name: '冷藏保鲜层',
    title: '01 冷藏保鲜层',
    desc: '双路微冷循环风道技术，智能控温保鲜，温度区间：2℃至8℃。',
    specs: {
      material: '食品级 ABS / 钢化玻璃',
      weight: '18.5 kg',
      status: '正常',
      temp: '4.0 ℃',
      vibration: '0.1 mm/s',
      power: '---',
      efficiency: '92.0%'
    },
    pos: [0, 0.65, 0.35]
  },
  '02': {
    id: 'RF-FZ-002',
    name: '极速冷冻层',
    title: '02 极速冷冻层',
    desc: '超导一体风冷无霜蒸发器，最低制冷温度可达 -24℃。',
    specs: {
      material: '发泡聚氨酯 / 铝板',
      weight: '24.2 kg',
      status: '活动',
      temp: '-18.0 ℃',
      vibration: '0.2 mm/s',
      power: '---',
      efficiency: '95.0%'
    },
    pos: [0, -0.45, 0.35]
  },
  '03': {
    id: 'RF-CP-003',
    name: '变频压缩机',
    title: '03 变频压缩机',
    desc: '双转子直流变频静音压缩机，能耗比极佳，全天候噪音低于32dB。',
    specs: {
      material: '铸钢 / 铜绕组',
      weight: '12.0 kg',
      status: '正常',
      temp: '45.2 ℃',
      vibration: '0.8 mm/s',
      power: '120 W',
      efficiency: '96.5%'
    },
    pos: [0, -0.85, -0.45]
  },
  '04': {
    id: 'RF-SP-004',
    name: '智能控制板',
    title: '04 智能控制板',
    desc: '透光晶体玻璃晶格触屏，集成智能物联控制芯片。',
    specs: {
      material: '微处理器 / LCD 面板',
      weight: '0.85 kg',
      status: '在线',
      temp: '28.1 ℃',
      vibration: '0.0 mm/s',
      power: '12 W',
      efficiency: '98.0%'
    },
    pos: [0.55, 0.4, 0.45]
  },
  '05': {
    id: 'RF-FN-005',
    name: '双循环风扇',
    title: '05 双循环风扇',
    desc: '冷藏与冷冻舱独立无刷直流空气循环风扇，提供高效强制冷气对流。',
    specs: {
      material: '强化工程塑料',
      weight: '0.45 kg',
      status: '正常',
      temp: '-2.0 ℃',
      vibration: '0.1 mm/s',
      power: '8 W',
      efficiency: '94.0%'
    },
    pos: [0, 0.85, 0.2]
  },
  '06': {
    id: 'RF-MT-006',
    name: '宽频变温舱',
    title: '06 宽频变温舱',
    desc: '支持 -20℃ 至 5℃ 宽幅温度精准调节的独立抽屉，满足不同食材保鲜需求。',
    specs: {
      material: '食品级高透 PP',
      weight: '4.2 kg',
      status: '正常',
      temp: '0.0 ℃',
      vibration: '---',
      power: '---',
      efficiency: '95.0%'
    },
    pos: [0, 0.15, 0.35]
  },
  '07': {
    id: 'RF-DD-007',
    name: '除菌净味模块',
    title: '07 除菌净味模块',
    desc: '主动式高浓度负氧离子群除菌系统，强力祛除异味并有效降解农残。',
    specs: {
      material: '纳米触媒催化剂',
      weight: '0.3 kg',
      status: '在线',
      temp: '8.0 ℃',
      vibration: '---',
      power: '4 W',
      efficiency: '99.0%'
    },
    pos: [0.35, 0.55, 0.1]
  },
  '08': {
    id: 'RF-CD-008',
    name: '冷凝器排热板',
    title: '08 冷凝器排热板',
    desc: '隐藏式金属背板冷凝热交换器，将压缩机排出的高压热量均匀散发。',
    specs: {
      material: '高导热铝制板管',
      weight: '8.5 kg',
      status: '运行',
      temp: '38.2 ℃',
      vibration: '0.2 mm/s',
      power: '---',
      efficiency: '93.5%'
    },
    pos: [0, 0, -0.38]
  }
};

// Battery parts metadata
const BATTERY_PARTS = {
  '01': {
    id: 'BT-AT-001',
    name: '正极端子',
    title: '01 正极汇流端子',
    desc: '阳极集流体采用高导电防氧化铜合金镀金，接触内阻极低。',
    specs: {
      material: '铜合金镀金',
      weight: '0.12 kg',
      status: '正常',
      temp: '32.5 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.8%'
    },
    pos: [0, 1.15, 0]
  },
  '02': {
    id: 'BT-CT-002',
    name: '负极端子',
    title: '02 负极连接端子',
    desc: '阴极集流体外层使用高纯度镍片复合冲压压铸而成，散热性极佳。',
    specs: {
      material: '高纯度复合镍板',
      weight: '0.15 kg',
      status: '正常',
      temp: '31.8 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.6%'
    },
    pos: [0, -1.15, 0]
  },
  '03': {
    id: 'BT-MS-003',
    name: '纳米多孔隔膜',
    title: '03 纳米多孔隔膜',
    desc: '12μm 多孔聚乙烯安全隔离层，熔融自闭安全防护温度达130℃。',
    specs: {
      material: '多孔聚乙烯安全膜',
      weight: '0.05 kg',
      status: '绝缘',
      temp: '29.5 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.9%'
    },
    pos: [0, 0, 0.15]
  },
  '04': {
    id: 'BT-SE-004',
    name: '固态电解质',
    title: '04 固态电解质',
    desc: '新型固态锂聚合物电解质凝胶，大幅抑制锂枝晶生长，消除漏液风险。',
    specs: {
      material: '锂聚合物凝胶',
      weight: '1.45 kg',
      status: '正常',
      temp: '34.2 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '97.2%'
    },
    pos: [0.35, 0, -0.2]
  },
  '05': {
    id: 'BT-IC-005',
    name: '绝缘防爆壳',
    title: '05 绝缘防爆密封壳',
    desc: '高强度复合树脂防爆外壳，提供高级电气绝缘、抗机械挤压及防水防尘。',
    specs: {
      material: '高强度阻燃 ABS/PC',
      weight: '3.5 kg',
      status: '正常',
      temp: '25.5 ℃',
      vibration: '---',
      power: '---',
      efficiency: '99.9%'
    },
    pos: [0.45, 0, 0.25]
  },
  '06': {
    id: 'BT-TH-006',
    name: '测温线束',
    title: '06 温度检测线束',
    desc: '高集成式多点 NTC 热敏电阻传感器排线，精确捕获内部电芯温度异动。',
    specs: {
      material: '镀锡扁平铜线 / FEP',
      weight: '0.18 kg',
      status: '在线',
      temp: '30.2 ℃',
      vibration: '---',
      power: '---',
      efficiency: '99.5%'
    },
    pos: [0, 0.6, 0.15]
  },
  '07': {
    id: 'BT-PR-007',
    name: '泄压爆破阀',
    title: '07 泄压爆破安全阀',
    desc: '高灵敏度单向机械爆破片，在电芯内压异常升高时主动开启定向排气泄压。',
    specs: {
      material: '防爆铝合金薄膜',
      weight: '0.02 kg',
      status: '正常',
      temp: '28.0 ℃',
      vibration: '---',
      power: '---',
      efficiency: '100%'
    },
    pos: [0, 1.1, 0.3]
  },
  '08': {
    id: 'BT-BM-008',
    name: 'BMS控制器',
    title: '08 电池管理系统 (BMS)',
    desc: '搭载专有SOC估算算法，监控单体过充过放，并控制主动式电荷均衡。',
    specs: {
      material: '双核 MCU 核心板',
      weight: '0.15 kg',
      status: '在线',
      temp: '35.4 ℃',
      vibration: '---',
      power: '5 W',
      efficiency: '98.5%'
    },
    pos: [0.2, 1.05, 0.1]
  }
};

// Turbine parts metadata
const TURBINE_PARTS = {
  '01': {
    id: 'WT-FR-001',
    name: '桨叶转子',
    title: '01 桨叶转子',
    desc: '高刚性碳纤维结构叶片，捕捉微弱风能并转化为转矩机械能。',
    specs: {
      material: '碳纤维复合材料',
      weight: '8.45 吨',
      status: '正常',
      temp: '32.1 ℃',
      vibration: '1.2 mm/s',
      power: '---',
      efficiency: '94.5%'
    },
    pos: [0, 1.25, 0.83]
  },
  '02': {
    id: 'WT-BH-002',
    name: '主轴承座箱',
    title: '02 主轴承座箱',
    desc: '重载调心滚子轴承座，承受风力发电机偏航与俯仰弯矩扭矩载荷。',
    specs: {
      material: '高韧性球墨铸铁 QT400',
      weight: '9.35 吨',
      status: '正常',
      temp: '45.8 ℃',
      vibration: '1.5 mm/s',
      power: '---',
      efficiency: '99.1%'
    },
    pos: [0, 1.17, -0.6]
  },
  '03': {
    id: 'WT-CS-003',
    name: '主轴系统',
    title: '03 主轴系统',
    desc: '高强度锻钢主轴，支承风轮气动力与交变载荷并传递扭矩。',
    specs: {
      material: '合金锻钢 34CrNiMo6',
      weight: '12.80 吨',
      status: '正常',
      temp: '41.2 ℃',
      vibration: '1.8 mm/s',
      power: '---',
      efficiency: '98.5%'
    },
    pos: [0, 1.17, 0.15]
  },
  '04': {
    id: 'WT-GS-004',
    name: '行星齿轮级',
    title: '04 行星齿轮级',
    desc: '两级行星齿轮及一级平行齿轮增速机构，将低速轴增速至额定发电转速。',
    specs: {
      material: '合金渗碳钢 18CrNiMo7-6',
      weight: '15.20 吨',
      status: '正常',
      temp: '54.5 ℃',
      vibration: '2.4 mm/s',
      power: '---',
      efficiency: '97.8%'
    },
    pos: [0, 1.29, 0.38]
  },
  '05': {
    id: 'WT-PM-005',
    name: '发电机模块',
    title: '05 发电机模块',
    desc: '全功率变流集成柜与双馈发电机，实现网侧与电机侧双向变流与电能调制。',
    specs: {
      material: 'IGBT 晶闸管阵列',
      weight: '3.10 吨',
      status: '在线',
      temp: '42.3 ℃',
      vibration: '0.8 mm/s',
      power: '3.2 MW',
      efficiency: '96.8%'
    },
    pos: [0, 1.25, -0.2]
  },
  '06': {
    id: 'WT-YR-006',
    name: '偏航回转齿圈',
    title: '06 偏航回转齿圈',
    desc: '大型内啮合重载回转支承大齿齿轮圈，承载整个机舱的偏航负载与剪切力。',
    specs: {
      material: '碳素铸钢 ZG310-570',
      weight: '4.50 吨',
      status: '正常',
      temp: '28.5 ℃',
      vibration: '0.4 mm/s',
      power: '---',
      efficiency: '98.0%'
    },
    pos: [0, 0.45, -0.45]
  }
};

// Static coordinates for selected leader line [0, 0, 0] to [0.2, 0.18, 0] to prevent memory churn
// Static coordinates for selected leader line [0, 0, 0] to [0.2, 0.18, 0] to prevent memory churn
const LEADER_LINE_ARRAY = new Float32Array([0, 0, 0, 0.2, 0.18, 0]);

// Pre-allocated static geometries for TagNode to eliminate memory leaks and GC overhead
const tagSphereGeometry = new THREE.SphereGeometry(0.045, 16, 16);
const tagTriggerGeometry = new THREE.SphereGeometry(0.28, 12, 12);
const tagRingGeometry = new THREE.RingGeometry(0.065, 0.085, 16);
const leaderLineGeometry = new THREE.BufferGeometry();
leaderLineGeometry.setAttribute('position', new THREE.BufferAttribute(LEADER_LINE_ARRAY, 3));

// 3D Tag and Hotspot Node Component (renders inside R3F)
function TagNode({ partId, name, position, isSelected, isHovered, onSelect, onHover, explode, desc, partCode, isActiveMode = true }) {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.012;
      const pulse = 1.0 + Math.sin(state.clock.elapsedTime * 3.5) * 0.08;
      meshRef.current.scale.setScalar(isSelected ? 1.3 : pulse);
    }
  });

  const labelOffset = [0.2, 0.18, 0];

  // Fade out tags when model is fully closed to prevent clustered overlapping
  const tagOpacity = isSelected ? 1.0 : Math.max(0.05, Math.min(0.85, (explode - 0.06) * 5.5));

  return (
    <group position={position}>
      {/* Visual Hotspot sphere */}
      <mesh geometry={tagSphereGeometry}>
        <meshBasicMaterial color={isSelected ? '#ffffff' : '#3b82f6'} transparent opacity={tagOpacity} />
      </mesh>

      {/* Large Invisible Hit Target Sphere (low-poly proxy collider for easy hover & click) */}
      <mesh
        geometry={tagTriggerGeometry}
        onClick={tagOpacity >= 0.15 && isActiveMode ? (e) => {
          e.stopPropagation();
          onSelect();
        } : undefined}
        onPointerOver={tagOpacity >= 0.15 && isActiveMode ? (e) => {
          e.stopPropagation();
          onHover(partId);
        } : undefined}
        onPointerOut={tagOpacity >= 0.15 && isActiveMode ? (e) => {
          e.stopPropagation();
          onHover(null);
        } : undefined}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Pulsing wireframe circle */}
      <mesh ref={meshRef} geometry={tagRingGeometry}>
        <meshBasicMaterial
          color={isSelected ? '#ffffff' : '#3b82f6'}
          side={THREE.DoubleSide}
          transparent
          opacity={tagOpacity * 0.7}
        />
      </mesh>

      {/* Floating Leader Line */}
      {isSelected && (
        <line geometry={leaderLineGeometry}>
          <lineBasicMaterial attach="material" color="#3b82f6" transparent opacity={0.5} />
        </line>
      )}

      {/* Floating 3D Label Tag */}
      <Html position={labelOffset} center distanceFactor={6.2}>
        <div 
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(partId);
          }}
          onPointerOut={() => {
            onHover(null);
          }}
          style={{ position: 'relative' }}
        >
          <TagLabel 
            $selected={isSelected} 
            onClick={onSelect}
            style={{ opacity: tagOpacity, pointerEvents: tagOpacity < 0.15 ? 'none' : 'auto' }}
          >
            <span className="num">{partId}</span>
            <span className="name">{name}</span>
          </TagLabel>
          
          <DetailTooltip $visible={isHovered && tagOpacity >= 0.15}>
            <div className="tooltip-title">
              <span>{partCode}</span>
              <span style={{ color: '#ffffff', opacity: 0.6 }}>全息说明</span>
            </div>
            <div className="tooltip-desc">{desc}</div>
          </DetailTooltip>
        </div>
      </Html>
    </group>
  );
}

const MemoizedTagNode = React.memo(TagNode, (prevProps, nextProps) => {
  return (
    prevProps.partId === nextProps.partId &&
    prevProps.name === nextProps.name &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.explode === nextProps.explode &&
    prevProps.desc === nextProps.desc &&
    prevProps.partCode === nextProps.partCode &&
    prevProps.isActiveMode === nextProps.isActiveMode &&
    prevProps.position[0] === nextProps.position[0] &&
    prevProps.position[1] === nextProps.position[1] &&
    prevProps.position[2] === nextProps.position[2]
  );
});

// Procedural Refrigerator Model
function Refrigerator({ explode }) {
  const ref = useRef();
  
  // Exploded translations mapping
  const doorRotateY = explode * (Math.PI * 0.65); // Open doors up to 120deg
  const drawerZ = explode * 0.72; // Slide drawers forward
  const shelfZ = explode * 0.42; // Slide shelf forward
  const backPanelY = -explode * 0.35; // Back panels push back/down

  return (
    <group ref={ref}>
      {/* 1. Main Cabinet Shell (Translucent clean glass structure) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 2.0, 0.8]} />
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0.1}
          metalness={0.1}
          transmission={0.9}
          ior={1.5}
          thickness={0.5}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe border outlining the cabinet shell */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 2.0, 0.8]} />
        <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.15} />
      </mesh>

      {/* 2. Divider Panel (Center Shelf) */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.96, 0.03, 0.72]} />
        <meshBasicMaterial color="#cbd5e1" transparent opacity={0.25} />
      </mesh>

      {/* 3. Sliding Upper Food Shelf */}
      <group position={[0, 0.5, shelfZ]}>
        <mesh>
          <boxGeometry args={[0.92, 0.02, 0.68]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} transparent opacity={0.4} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.92, 0.02, 0.68]} />
          <meshBasicMaterial color="#cbd5e1" wireframe transparent opacity={0.12} />
        </mesh>
      </group>

      {/* 4. Sliding Freezer Drawer */}
      <group position={[0, -0.45, drawerZ]}>
        <mesh>
          <boxGeometry args={[0.88, 0.35, 0.65]} />
          <meshPhysicalMaterial color="#93c5fd" transmission={0.8} transparent opacity={0.12} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.88, 0.35, 0.65]} />
          <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.15} />
        </mesh>
      </group>

      {/* 5. Rotary Doors (Upper Door hinges on the right, Lower Door on left) */}
      <group position={[0.5, 0.55, 0.4]}>
        <group rotation={[0, -doorRotateY, 0]} position={[-0.5, 0, 0]}>
          <mesh position={[0.5, 0, 0.02]}>
            <boxGeometry args={[0.96, 0.9, 0.05]} />
            <meshPhysicalMaterial color="#ffffff" transmission={0.8} transparent opacity={0.25} />
          </mesh>
          <mesh position={[0.5, 0, 0.02]}>
            <boxGeometry args={[0.96, 0.9, 0.05]} />
            <meshBasicMaterial color="#e2e8f0" wireframe transparent opacity={0.15} />
          </mesh>
        </group>
      </group>

      {/* 6. Compressor (Cylinder component at the back bottom) */}
      <group position={[0, -0.85, backPanelY - 0.28]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.32, 16]} />
          <meshBasicMaterial color="#475569" transparent opacity={0.4} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.32, 16]} />
          <meshBasicMaterial color="#cbd5e1" wireframe transparent opacity={0.2} />
        </mesh>
      </group>
    </group>
  );
}

const MemoizedRefrigerator = React.memo(Refrigerator);

// Procedural Battery Model
function Battery({ explode }) {
  const ref = useRef();

  // Exploded translations mapping
  const caseX = explode * 0.76;       // Shell splits in half along X-axis
  const cathodeY = -explode * 0.5;   // Cathode shifts down
  const anodeY = explode * 0.5;       // Anode shifts up
  const coreZ = explode * 0.4;        // Internal layers separate slightly along Z

  return (
    <group ref={ref}>
      {/* 1. Translucent Outer Casing (Left Half) */}
      <group position={[-caseX, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, 0, Math.PI]} />
          <meshPhysicalMaterial
            color="#e2e8f0"
            roughness={0.08}
            transmission={0.9}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, 0, Math.PI]} />
          <meshBasicMaterial color="#cbd5e1" wireframe transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Translucent Outer Casing (Right Half) */}
      <group position={[caseX, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, Math.PI, Math.PI]} />
          <meshPhysicalMaterial
            color="#e2e8f0"
            roughness={0.08}
            transmission={0.9}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, Math.PI, Math.PI]} />
          <meshBasicMaterial color="#cbd5e1" wireframe transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* 2. Active Cathode Terminal (-) */}
      <group position={[0, cathodeY - 0.96, 0]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.12, 16]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.12, 16]} />
          <meshBasicMaterial color="#93c5fd" wireframe transparent opacity={0.2} />
        </mesh>
      </group>

      {/* 3. Active Anode Terminal (+) */}
      <group position={[0, anodeY + 0.96, 0]}>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
          <meshBasicMaterial color="#dc2626" transparent opacity={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
          <meshBasicMaterial color="#fca5a5" wireframe transparent opacity={0.2} />
        </mesh>
      </group>

      {/* 4. Internal Separator Matrix Layer */}
      <group position={[0, 0, coreZ]}>
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.5, 16]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} transparent opacity={0.22} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.5, 16]} />
          <meshBasicMaterial color="#cbd5e1" wireframe transparent opacity={0.12} />
        </mesh>
      </group>

      {/* 5. Electrolyte Colloidal Matrix */}
      <group position={[0, 0, -coreZ]}>
        <mesh>
          <cylinderGeometry args={[0.35, 0.35, 1.35, 12]} />
          <meshBasicMaterial color="#93c5fd" transparent opacity={0.18} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.35, 0.35, 1.35, 12]} />
          <meshBasicMaterial color="#60a5fa" wireframe transparent opacity={0.1} />
        </mesh>
      </group>
    </group>
  );
}

const MemoizedBattery = React.memo(Battery);

// Helper to map Turbine part IDs to their initial local coordinates in the GLB
const getTurbinePartLocalPos = (id) => {
  switch (id) {
    case '01': return [0, 1.25, 0.81];     // Blades
    case '02': return [0, 1.20, 0.48];     // Yaw/Main shaft bearing
    case '03': return [0, 1.20, 0.15];     // Gearbox
    case '04': return [0, 1.20, -0.15];    // Generator
    case '05': return [0, 0.45, -0.50];    // Yaw gear ring
    case '06': return [0, 1.20, -0.85];    // Converter nacelle tail
    default: return [0, 0, 0];
  }
};

// Procedural high-fidelity Wind Turbine Model loaded from GLB
function Turbine({ explode, turbineRef, configMode, selectedMeshIdx, hoveredMeshIdx }) {
  const { scene } = useGLTF("/model/glb/turbine.glb");

  // Create a single stable clone of the GLB scene to prevent geometries recreation on every render
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    // Enable shadows on all child meshes
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Pre-allocate materials once using useMemo to prevent WebGL memory leak
  const selectedMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d97706',
    emissive: '#78350f',
    roughness: 0.1,
    metalness: 0.8
  }), []);

  const hoveredMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2563eb',
    emissive: '#1d4ed8',
    roughness: 0.2,
    metalness: 0.5
  }), []);

  const transparentMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#475569',
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  }), []);

  // Clean up materials on unmount to prevent GPU resource leaks
  useEffect(() => {
    return () => {
      selectedMaterial.dispose();
      hoveredMaterial.dispose();
      transparentMaterial.dispose();
    };
  }, [selectedMaterial, hoveredMaterial, transparentMaterial]);

  useFrame((state, delta) => {
    if (!turbineRef.current) return;
    
    // Rotate the blades when not exploded or slowly when exploded
    const blades = turbineRef.current.getObjectByName("defaultMaterial_45");
    if (blades) {
      blades.rotateY(delta * (1.2 * (1 - explode * 0.85))); // Rotates slower as it explodes
    }

    // Apply real-time explode translation along Z axis in sorted Z-order to prevent components splitting/crossing
    const children = turbineRef.current.children;
    if (children && children.length > 0) {
      if (!turbineRef.current.userData.sortedChildren) {
        const meshesWithZ = [];
        children.forEach((child, index) => {
          if (child.isMesh) {
            if (!child.userData.originPosition) {
              child.userData.originPosition = child.position.clone();
            }
            meshesWithZ.push({ child, index, z: child.userData.originPosition.z });
          }
        });
        // Sort ascending by initial Z coordinate
        meshesWithZ.sort((a, b) => a.z - b.z);
        const sortedMap = {};
        meshesWithZ.forEach((item, rank) => {
          sortedMap[item.index] = rank;
        });
        turbineRef.current.userData.sortedMap = sortedMap;
        turbineRef.current.userData.sortedChildren = meshesWithZ;
      }

      const sortedChildren = turbineRef.current.userData.sortedChildren;
      const length = sortedChildren.length;
      const mid = (length - 1) / 2;
      const step = 0.15;

      children.forEach((child, index) => {
        if (child.isMesh) {
          const originPos = child.userData.originPosition;
          const rank = turbineRef.current.userData.sortedMap[index];
          const offset = (rank - mid) * step * explode;
          child.position.z = originPos.z + offset;
        }
      });
    }
  });

  // Dynamically swap materials for configuration mode highlights
  useEffect(() => {
    if (!turbineRef.current) return;
    const children = turbineRef.current.children;
    if (!children) return;

    children.forEach((child, index) => {
      if (child.isMesh) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }

        if (configMode) {
          if (index === selectedMeshIdx) {
            child.material = selectedMaterial;
          } else if (index === hoveredMeshIdx) {
            child.material = hoveredMaterial;
          } else {
            child.material = transparentMaterial;
          }
        } else {
          // Restore original material
          child.material = child.userData.originalMaterial;
        }
      }
    });
  }, [configMode, selectedMeshIdx, hoveredMeshIdx, turbineRef, selectedMaterial, hoveredMaterial, transparentMaterial]);

  return (
    <group scale={1.2} position={[0, -0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
      <primitive
        ref={turbineRef}
        object={clonedScene}
      />
    </group>
  );
}

const MemoizedTurbine = React.memo(Turbine);

// Scene controller that binds models, rotation physics, and hotspots
function SpatialScene({
  activeModel,
  fuseTriggered,
  explode,
  setExplode,
  selectedPartId,
  setSelectedPartId,
  fov,
  setFov,
  autoRotate,
  cameraPreset,
  setCameraPreset,
  focusMode,
  setFocusMode,
  hoveredPartId,
  setHoveredPartId,
  configMode,
  selectedMeshIdx,
  setSelectedMeshIdx,
  hoveredMeshIdx,
  setHoveredMeshIdx,
  customTurbineParts,
  setCustomTurbineParts,
  partMeshIndices,
  setPartMeshIndices,
  onModelLoaded,
  cursorMode
}) {
  const groupRef = useRef();
  const tickRingRef = useRef();
  const turbineRef = useRef();
  const isPinchingRef = useRef(false);
  const prevCursorRef = useRef({ x: 0, y: 0 });
  const modelGroupRef = useRef();
  const isFistDraggingRef = useRef(false);
  const prevHandsDistRef = useRef(null);
  const prevHandsVertDistRef = useRef(null);
  const peaceStartTimeRef = useRef(null);
  const peaceTriggeredRef = useRef(false);
  const twoHandsFistStartTimeRef = useRef(null);
  const twoHandsFistTriggeredRef = useRef(false);
  const palmStartTimeRef = useRef(null);
  const palmTriggeredRef = useRef(false);
  const targetRotationRef = useRef({ x: 0.15, y: -0.4 });

  const mappingCalculated = useRef(false);
  const turbineMeshCentersRef = useRef({});
  const lastFrameTimeRef = useRef(performance.now());
  const smoothFpsRef = useRef(60);

  // Performance caches for THREE.Vector3 to prevent high-frequency GC allocations
  const cacheVec3_targetCenter = useRef(new THREE.Vector3(0, 0, 0));
  const cacheVec3_targetPos = useRef(new THREE.Vector3(0, 0, 0));
  const cacheVec3_originZero = useRef(new THREE.Vector3(0, 0, 0));

  const { gl } = useThree();

  useEffect(() => {
    mappingCalculated.current = false;
    turbineMeshCentersRef.current = {};
    setPartMeshIndices({});
    if (groupRef.current) {
      groupRef.current.rotation.set(0.15, -0.4, 0);
    }
    targetRotationRef.current = { x: 0.15, y: -0.4 };
  }, [activeModel, setPartMeshIndices]);

  // Recalculate mesh mappings when custom turbine parts change
  useEffect(() => {
    mappingCalculated.current = false;
  }, [customTurbineParts]);

  // Bind WebGL context events for stability logging
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleContextLost = (event) => {
      event.preventDefault();
      pushCrashLog('webglcontextlost', {
        userAgent: navigator.userAgent,
        dpr: window.devicePixelRatio,
        width: canvas.width,
        height: canvas.height,
        activeModel,
        selectedPartId,
        isSafeMode,
        rendererInfo: {
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs ? gl.info.programs.length : 0,
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
        }
      });
      if (typeof window !== 'undefined') {
        window.__webgl_context_lost__ = true;
      }
    };

    const handleContextRestored = () => {
      pushCrashLog('webglcontextrestored');
      if (typeof window !== 'undefined') {
        window.__webgl_context_lost__ = false;
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl, activeModel, selectedPartId]);

  const {
    cursor,
    handDetected,
    trackingMode,
    isPinching,
    isFist,
    isPeaceSign,
    isPalm,
    twoHandsDetected,
    twoHandsDistance,
    twoHandsVerticalDistance,
    twoHandsFist,
    twoHandsPalm
  } = useHandTracking();

  useFrame((state, delta) => {
    const { camera, controls } = state;
    const group = groupRef.current;
    if (!group) return;

    // Calculate App FPS
    const nowFrame = performance.now();
    const deltaMs = nowFrame - lastFrameTimeRef.current;
    lastFrameTimeRef.current = nowFrame;
    if (deltaMs > 0) {
      const currentFps = 1000 / deltaMs;
      smoothFpsRef.current = smoothFpsRef.current * 0.95 + currentFps * 0.05;
      if (typeof window !== 'undefined') {
        window.__THREE_FPS__ = Math.round(smoothFpsRef.current);
      }
    }

    // Expose renderer stats for the watchdog
    if (typeof window !== 'undefined') {
      window.__THREE_RENDERER_STATS__ = {
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs ? (gl.info.programs.length || 0) : 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      };
    }

    // Dynamically calculate the mapping from turbine parts to closest child meshes on load
    if (activeModel === 'turbine' && turbineRef.current && !mappingCalculated.current) {
      const children = turbineRef.current.children;
      if (children && children.length > 0) {
        const mapping = {};
        const centers = {};
        Object.entries(customTurbineParts).forEach(([id, item]) => {
          let closestChildIndex = -1;
          let minDistance = Infinity;
          // Use the actual pos configured in customTurbineParts
          const [lx, ly, lz] = item.pos;
          const targetPos = new THREE.Vector3(lx, ly, lz);
          const closestCenter = new THREE.Vector3();

          children.forEach((child, index) => {
            if (child.isMesh) {
              if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
              }
              const center = new THREE.Vector3();
              child.geometry.boundingBox.getCenter(center);
              center.applyMatrix4(child.matrix);
              
              // Use Z-coordinate distance only to align segments along the length of the turbine, preventing Y-height collisions
              const dist = Math.abs(center.z - targetPos.z);
              if (dist < minDistance) {
                minDistance = dist;
                closestChildIndex = index;
                closestCenter.copy(center);
              }
            }
          });
          mapping[id] = closestChildIndex;
          centers[id] = [closestCenter.x, closestCenter.y, closestCenter.z];
        });
        setPartMeshIndices(mapping);
        turbineMeshCentersRef.current = centers;
        mappingCalculated.current = true;

        // Populate mesh list for configuration panel
        const list = children.map((c, i) => ({
          index: i,
          name: c.name,
          isMesh: c.isMesh
        }));
        setTimeout(() => {
          if (onModelLoaded) {
            onModelLoaded(list);
          }
        }, 0);
      }
    }

    // Direct R3F raycaster pointer to the hand cursor coordinate if hand tracking is active
    if (trackingMode !== 'mouse' && handDetected) {
      state.pointer.set(cursor.x, cursor.y);
      
      // Control 3D group rotation via air hand movement ONLY when in fist dragging state
      const isDragging = isFist && !twoHandsDetected;
      if (isDragging) {
        if (!isFistDraggingRef.current) {
          if (cursor.y > -0.55) {
            isFistDraggingRef.current = true;
            prevCursorRef.current = { x: cursor.x, y: cursor.y };
          }
        } else {
          const dx = cursor.x - prevCursorRef.current.x;
          const dy = cursor.y - prevCursorRef.current.y;
          
          targetRotationRef.current.y += dx * 2.8;
          targetRotationRef.current.x = Math.max(-0.65, Math.min(0.65, targetRotationRef.current.x + dy * 2.0));
          
          prevCursorRef.current = { x: cursor.x, y: cursor.y };
        }
      } else {
        isFistDraggingRef.current = false;
      }
    } else if (autoRotate) {
      targetRotationRef.current.y += delta * 0.15;
    }

    // Smoothly LERP rotation for lag-free inertial drag experience
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRotationRef.current.y, 0.15);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetRotationRef.current.x, 0.15);

    // Smoothly LERP camera fov for lens zoom effect
    const targetFov = focusMode ? 30 : fov;
    if (camera.fov !== targetFov) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.15);
      camera.updateProjectionMatrix();
    }

    // Smoothly animate camera to presets
    if (cameraPreset) {
      const targetPos = cacheVec3_targetPos.current.set(0, 0, 4.8);
      switch (cameraPreset) {
        case 'home':
          targetPos.set(0, 0, 4.8);
          break;
        case 'front':
          targetPos.set(0, 0, 4.8);
          break;
        case 'side':
          targetPos.set(4.8, 0, 0.01);
          break;
        case 'top':
          targetPos.set(0, 4.8, 0.01);
          break;
        case 'iso':
          targetPos.set(3.2, 2.5, 3.2);
          break;
        default:
          break;
      }

      camera.position.lerp(targetPos, 0.1);
      
      if (controls) {
        controls.target.lerp(cacheVec3_originZero.current.set(0, 0, 0), 0.1);
        controls.update();
      }

      if (camera.position.distanceTo(targetPos) < 0.02) {
        setCameraPreset(null);
      }
    }

    // Smoothly focus on selected part or whole model
    if (controls && !cameraPreset) {
      const targetCenter = cacheVec3_targetCenter.current.set(0, 0, 0);
      if (focusMode && selectedPartId) {
        const item = partsData[selectedPartId];
        if (item) {
          const explodedPos = getExplodedPosition(selectedPartId, item.pos);
          targetCenter.set(explodedPos[0], explodedPos[1], explodedPos[2]);
        }
      }
      if (controls.target.distanceToSquared(targetCenter) > 0.0001) {
        controls.target.lerp(targetCenter, 0.1);
        controls.update();
      }
    }

    // Rotate tick ring
    if (tickRingRef.current) {
      tickRingRef.current.rotation.z -= delta * 0.15;
    }
  });

  // Handle hand pinch gesture to select the currently hovered 3D sub-component
  useEffect(() => {
    if (trackingMode !== 'mouse' && handDetected && isPinching && !twoHandsDetected) {
      if (hoveredPartId) {
        setSelectedPartId(hoveredPartId);
      }
    }
  }, [isPinching, hoveredPartId, handDetected, trackingMode, twoHandsDetected, setSelectedPartId]);

  // Performance Optimization: Traverse model and disable complex mesh raycasting
  useEffect(() => {
    if (modelGroupRef.current) {
      modelGroupRef.current.traverse((child) => {
        if (child.isMesh) {
          child.raycast = () => null;
        }
      });
    }
  }, [activeModel]);

  // Gesture 4: Two-handed distance change -> Adjust camera zoom (FOV)
  useEffect(() => {
    if (twoHandsDetected && trackingMode !== 'mouse') {
      if (prevHandsDistRef.current !== null && prevHandsDistRef.current > 0) {
        const delta = twoHandsDistance - prevHandsDistRef.current;
        if (Math.abs(delta) > 0.01) {
          setFov(prev => Math.max(15, Math.min(85, prev - delta * 18)));
        }
      }
      prevHandsDistRef.current = twoHandsDistance;
    } else {
      prevHandsDistRef.current = null;
    }
  }, [twoHandsDetected, twoHandsDistance, trackingMode]);

  // Gesture 5: Two-handed vertical pull/push -> Adjust explodeAmount
  useEffect(() => {
    if (twoHandsDetected && trackingMode !== 'mouse' && !twoHandsFist) {
      if (prevHandsVertDistRef.current !== null && prevHandsVertDistRef.current > 0) {
        const delta = twoHandsVerticalDistance - prevHandsVertDistRef.current;
        if (Math.abs(delta) > 0.01) {
          setExplode(prev => Math.max(0, Math.min(1, prev + delta * 1.5)));
        }
      }
      prevHandsVertDistRef.current = twoHandsVerticalDistance;
    } else {
      prevHandsVertDistRef.current = null;
    }
  }, [twoHandsDetected, twoHandsVerticalDistance, twoHandsFist, trackingMode]);

  // Gesture 6: V Sign (Peace) -> Toggle Focus Mode (held for 0.6 seconds)
  useEffect(() => {
    if (isPeaceSign && handDetected && trackingMode !== 'mouse' && !twoHandsDetected) {
      if (!peaceStartTimeRef.current) {
        peaceStartTimeRef.current = Date.now();
      } else if (!peaceTriggeredRef.current) {
        const elapsed = Date.now() - peaceStartTimeRef.current;
        if (elapsed >= 600) {
          setFocusMode(prev => !prev);
          peaceTriggeredRef.current = true;
        }
      }
    } else {
      peaceStartTimeRef.current = null;
      peaceTriggeredRef.current = false;
    }
  }, [isPeaceSign, handDetected, trackingMode, twoHandsDetected]);

  // Gesture 7: Open Palm (Palm) -> Cancel dragging / Return to default (held for 0.8 seconds to avoid accidental resets)
  useEffect(() => {
    if (isPalm && handDetected && trackingMode !== 'mouse') {
      if (!palmStartTimeRef.current) {
        palmStartTimeRef.current = Date.now();
      } else if (!palmTriggeredRef.current) {
        const elapsed = Date.now() - palmStartTimeRef.current;
        if (elapsed >= 800) {
          setSelectedPartId(null);
          setFocusMode(false);
          setHoveredPartId(null);
          setExplode(0);
          palmTriggeredRef.current = true;
        }
      }
    } else {
      palmStartTimeRef.current = null;
      palmTriggeredRef.current = false;
    }
  }, [isPalm, handDetected, trackingMode, setSelectedPartId, setFocusMode, setHoveredPartId, setExplode]);

  // Gesture 8: Two-handed Fist hold -> Reset to Home view (held for 0.8 seconds)
  useEffect(() => {
    if (twoHandsFist && handDetected && trackingMode !== 'mouse') {
      if (!twoHandsFistStartTimeRef.current) {
        twoHandsFistStartTimeRef.current = Date.now();
      } else if (!twoHandsFistTriggeredRef.current) {
        const elapsed = Date.now() - twoHandsFistStartTimeRef.current;
        if (elapsed >= 800) {
          setFov(48);
          setCameraPreset('home');
          setExplode(0);
          setSelectedPartId(null);
          setHoveredPartId(null);
          setFocusMode(false);
          twoHandsFistTriggeredRef.current = true;
        }
      }
    } else {
      twoHandsFistStartTimeRef.current = null;
      twoHandsFistTriggeredRef.current = false;
    }
  }, [twoHandsFist, handDetected, trackingMode]);

  const partsData = activeModel === 'fridge' 
    ? FRIDGE_PARTS 
    : (activeModel === 'battery' ? BATTERY_PARTS : customTurbineParts);

  const getExplodedPosition = useCallback((id, pos) => {
    const [x, y, z] = pos;
    if (activeModel === 'turbine') {
      let localX = 0;
      let localY = 0;
      let localZ = 0;
      
      switch (id) {
        case '01': // Blades
          localX = 0; localY = 1.25; localZ = 0.81;
          break;
        case '02': // Yaw/Main shaft bearing
          localX = 0; localY = 1.20; localZ = 0.48;
          break;
        case '03': // Gearbox
          localX = 0; localY = 1.20; localZ = 0.15;
          break;
        case '04': // Generator
          localX = 0; localY = 1.20; localZ = -0.15;
          break;
        case '05': // Yaw Gear Ring
          localX = 0; localY = 0.45; localZ = -0.50;
          break;
        case '06': // Converter nacelle tail
          localX = 0; localY = 1.20; localZ = -0.85;
          break;
        default:
          return pos;
      }
      
      // Calculate local Z explode displacement
      const zOffset = localZ * explode * 0.85;
      const explodedLocalZ = localZ + zOffset;
      
      // Project local GLB coordinates to rotated parent space:
      // Rotated by PI/2 around Y: [localX, localY, localZ] -> [localZ, localY, -localX]
      // Scaled by 1.2, and shifted by -0.6 along the Y-axis.
      const globalX = explodedLocalZ * 1.2;
      const globalY = localY * 1.2 - 0.6;
      const globalZ = -localX * 1.2;
      
      return [globalX, globalY, globalZ];
    }
    
    if (activeModel === 'battery') {
      if (id === '01') return [x, y + explode * 0.5, z];
      if (id === '02') return [x, y - explode * 0.5, z];
      if (id === '03') return [x, y, z + explode * 0.4];
      if (id === '04') return [x, y, z - explode * 0.4];
      if (id === '05') return [x + explode * 0.45, y, z];
      if (id === '06') return [x, y + explode * 0.25, z + explode * 0.15];
      if (id === '07') return [x, y + explode * 0.35, z + explode * 0.3];
      if (id === '08') return [x + explode * 0.2, y + explode * 0.35, z + explode * 0.1];
    }
    
    if (activeModel === 'fridge') {
      if (id === '01') return [x, y, z + explode * 0.42];
      if (id === '02') return [x, y, z + explode * 0.72];
      if (id === '03') return [x, y - explode * 0.35, z - explode * 0.28];
      if (id === '04') return [x - explode * 0.35, y, z + explode * 0.45];
      if (id === '05') return [x, y + explode * 0.3, z + explode * 0.2];
      if (id === '06') return [x, y, z + explode * 0.35];
      if (id === '07') return [x + explode * 0.35, y, z + explode * 0.1];
      if (id === '08') return [x, y, z - explode * 0.38];
    }
    
    return pos;
  }, [activeModel, explode]);


  const gridY = activeModel === 'fridge' ? -1.005 : (activeModel === 'battery' ? -0.905 : -0.605);

  const ambientIntensity = focusMode ? 1.0 : 0.75;
  const hemisphereIntensity = focusMode ? 1.1 : 0.85;
  const keyLightIntensity = focusMode ? 2.4 : 1.9;

  return (
    <>
      {/* Clean neutral studio ambient lights */}
      <ambientLight intensity={ambientIntensity} color="#ffffff" />
      <hemisphereLight skyColor="#ffffff" groundColor="#dddddd" intensity={hemisphereIntensity} />
      
      {/* Key Light (Neutral white studio light) */}
      <directionalLight 
        position={[8, 12, 8]} 
        intensity={keyLightIntensity} 
        color="#ffffff" 
        castShadow 
      />

      {/* Fill Light (Neutral cool fill) */}
      <directionalLight 
        position={[-8, 4, 8]} 
        intensity={0.9} 
        color="#eaeaea" 
      />

      {/* Bounce Light (Neutral ground bounce) */}
      <directionalLight 
        position={[0, -5, 0]} 
        intensity={0.45} 
        color="#dddddd" 
      />

      {/* Enable environment background and blur for realistic grey gradient studio skybox */}
      <Environment files="/hdr/venice_sunset_1k.hdr" background blur={0.8} intensity={1.2} />

      {/* Tech Grid on the floor */}
      <Grid
        infiniteGrid
        renderOrder={-1}
        position={[0, gridY, 0]}
        cellSize={0.6}
        cellThickness={0.6}
        sectionSize={3.3}
        sectionThickness={1.5}
        sectionColor="#cbd5e1"
        cellColor="#f1f5f9"
        fadeDistance={30}
      />
      
      <group 
        ref={groupRef} 
        rotation={[0.15, -0.4, 0]}
      >
        {/* Render selected model inside a group that has raycasting disabled */}
        <group ref={modelGroupRef}>
          {activeModel === 'fridge' ? (
            <MemoizedRefrigerator explode={explode} />
          ) : activeModel === 'battery' ? (
            <MemoizedBattery explode={explode} />
          ) : (
            <MemoizedTurbine 
              explode={explode} 
              turbineRef={turbineRef} 
              configMode={configMode}
              selectedMeshIdx={selectedMeshIdx}
              hoveredMeshIdx={hoveredMeshIdx}
            />
          )}
        </group>

        {/* Render respective tag nodes */}
        {!isSafeMode && !fuseTriggered && Object.entries(partsData).map(([id, item]) => {
          let explodedPos = getExplodedPosition(id, item.pos);

          // For the wind turbine, bind the tag position directly to the corresponding pre-calculated child mesh coordinate
          if (activeModel === 'turbine') {
            const centerArr = turbineMeshCentersRef.current[id];
            if (centerArr) {
              const meshIndex = partMeshIndices[id];
              let offset = 0;
              if (meshIndex !== undefined && meshIndex >= 0 && turbineRef.current) {
                const sortedMap = turbineRef.current.userData.sortedMap;
                const childrenLength = turbineRef.current.children.length;
                const mid = (childrenLength - 1) / 2;
                const step = 0.15;
                if (sortedMap && sortedMap[meshIndex] !== undefined) {
                  const rank = sortedMap[meshIndex];
                  offset = (rank - mid) * step * explode;
                } else {
                  offset = (meshIndex - mid) * step * explode;
                }
              }
              // Apply the scaling (1.2), position [0, -0.6, 0] and rotation [0, PI/2, 0] of the parent group
              explodedPos = [
                (centerArr[2] + offset) * 1.2,
                centerArr[1] * 1.2 - 0.6,
                -centerArr[0] * 1.2
              ];
            }
          }

          return (
            <MemoizedTagNode
              key={id}
              partId={id}
              name={item.name}
              position={explodedPos}
              isSelected={selectedPartId === id}
              isHovered={hoveredPartId === id}
              onSelect={() => setSelectedPartId(id)}
              onHover={setHoveredPartId}
              explode={explode}
              desc={item.desc}
              partCode={item.id}
              isActiveMode={trackingMode !== 'mouse' || cursorMode === 'select' || configMode}
            />
          );
        })}

        {/* Temporary tag node helper for Configurator mode */}
        {!isSafeMode && !fuseTriggered && configMode && selectedMeshIdx >= 0 && turbineRef.current && (
          (() => {
            const child = turbineRef.current.children[selectedMeshIdx];
            if (child && child.isMesh) {
              if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
              }
              const center = new THREE.Vector3();
              child.geometry.boundingBox.getCenter(center);
              center.applyMatrix4(child.matrix);
              
              const tempPos = [
                center.z * 1.2,
                center.y * 1.2 - 0.6,
                -center.x * 1.2
              ];
              
              const isAlreadyTagged = Object.entries(partMeshIndices).some(([pid, idx]) => idx === selectedMeshIdx);
              
              if (!isAlreadyTagged) {
                return (
                  <MemoizedTagNode
                    key="temp-config-tag"
                    partId="?"
                    name="待配置网格"
                    position={tempPos}
                    isSelected={true}
                    isHovered={false}
                    onSelect={() => {}}
                    onHover={() => {}}
                    explode={explode}
                    desc={`网格名称: ${child.name || 'Unnamed'}`}
                    partCode={`INDEX-${selectedMeshIdx}`}
                    isActiveMode={true}
                  />
                );
              }
            }
            return null;
          })()
        )}
      </group>
    </>
  );
}

const ObjectItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: ${props => props.$active ? 'rgba(37, 99, 235, 0.06)' : 'rgba(0, 0, 0, 0.01)'};
  border: 1px solid ${props => props.$active ? 'rgba(37, 99, 235, 0.3)' : 'rgba(0, 0, 0, 0.06)'};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.75rem;
  color: ${props => props.$active ? '#1e293b' : '#475569'};

  &:hover {
    background: rgba(37, 99, 235, 0.04);
    border-color: rgba(37, 99, 235, 0.2);
    color: #1e293b;
  }

  .label-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${props => props.$active ? '#2563eb' : 'transparent'};
  }
`;

const TreeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.5rem;
  border-left: 1px dashed rgba(0, 0, 0, 0.08);
`;

const TreeItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: ${props => props.$active ? '#2563eb' : '#475569'};
  background: ${props => props.$active ? 'rgba(37, 99, 235, 0.06)' : 'transparent'};
  transition: all 0.15s ease;

  &:hover {
    color: #2563eb;
    background: rgba(37, 99, 235, 0.03);
  }

  &::before {
    content: '';
    position: absolute;
    left: -0.5rem;
    top: 50%;
    width: 0.4rem;
    height: 1px;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
  }
`;

const BottomDock = styled.div`
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04), 0 12px 30px rgba(15, 23, 42, 0.06);
  border-radius: 30px;
  padding: 0.5rem 1.2rem;
  z-index: 6;
  pointer-events: auto;
  transition: all 0.3s ease;
  white-space: nowrap;

  @media (max-width: 968px) {
    position: relative;
    bottom: auto;
    left: auto;
    transform: none;
    flex-wrap: wrap;
    justify-content: center;
    border-radius: 12px;
    padding: 0.8rem;
    margin: 1rem 1.5rem;
    white-space: normal;
  }

  .dock-section {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .zoom-control {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .divider {
    width: 1px;
    height: 18px;
    background: rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    font-family: 'Outfit', sans-serif;
    white-space: nowrap;
  }

  button {
    background: transparent;
    border: 1px solid transparent;
    color: #475569;
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3rem 0.6rem;
    border-radius: 15px;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
      background: rgba(0, 0, 0, 0.04);
      color: #1e293b;
    }

    &.active {
      background: rgba(37, 99, 235, 0.08);
      border-color: rgba(37, 99, 235, 0.3);
      color: #2563eb;
    }
  }

  .zoom-display {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #2563eb;
    min-width: 38px;
    text-align: center;
    white-space: nowrap;
  }

  .explode-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    white-space: nowrap;

    input[type='range'] {
      -webkit-appearance: none;
      width: 70px;
      height: 3px;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.08);
      outline: none;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #2563eb;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
      }
    }
  }
`;


const Sparkline = ({ color = '#00f0ff', points = [10, 25, 15, 30, 20, 35, 15, 40, 25, 30] }) => {
  const width = 80;
  const height = 16;
  const step = width / (points.length - 1);
  const pathData = points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${height - (p / 45) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" style={{ filter: 'blur(1px)' }} />
    </svg>
  );
};

export default function SpatialUI() {
  const navigate = useNavigate();
  const [activeModel, setActiveModel] = useState('fridge'); // 'fridge', 'battery', 'turbine'
  const [explodeAmount, setExplodeAmount] = useState(0.0);
  
  // High-fidelity active sub-component selection state (defaults to '01')
  const [selectedPartId, setSelectedPartId] = useState('01');
  const [hoveredPartId, setHoveredPartId] = useState(null);

  // Camera view configuration states
  const [fov, setFov] = useState(48);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cameraPreset, setCameraPreset] = useState(null);
  const [focusMode, setFocusMode] = useState(false);

  // Sidebar collapse states for dynamic canvas resizing
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // Temporary slide-out expanders for sidebars when focusMode is active
  const [tempTelemetryShow, setTempTelemetryShow] = useState(false);
  const [tempConfigShow, setTempConfigShow] = useState(false);

  // Geometry Watchdog / Circuit Breaker states
  const [fuseTriggered, setFuseTriggered] = useState(false);
  const [rendererStats, setRendererStats] = useState(null);

  // Tag Configuration Mode States
  const [configMode, setConfigMode] = useState(false);
  const [selectedMeshIdx, setSelectedMeshIdx] = useState(-1);
  const [hoveredMeshIdx, setHoveredMeshIdx] = useState(-1);
  const [customTurbineParts, setCustomTurbineParts] = useState(TURBINE_PARTS);
  const [meshList, setMeshList] = useState([]);
  const [partMeshIndices, setPartMeshIndices] = useState({});

  // Selected search and interaction mode states
  const [searchTerm, setSearchTerm] = useState('');
  const [cursorMode, setCursorMode] = useState('orbit'); // 'orbit', 'pan', 'zoom', 'select'

  // Hook states
  const {
    trackingMode,
    setTrackingMode,
    handDetected,
    cursor,
    isPinching,
    isConnected,
    wsUrl,
    setWsUrl,
  } = useHandTracking();

  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [crashLogs, setCrashLogs] = useState([]);

  // Retrieve logs from localStorage when debug window is opened
  useEffect(() => {
    if (showDebugLogs) {
      try {
        const key = 'spatial_webgl_crash_logs';
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        setCrashLogs(logs.reverse()); // Newest first
      } catch (e) {
        console.error('Failed to read crash logs:', e);
      }
    }
  }, [showDebugLogs]);

  // Wire up global error and unhandled promise rejection listeners
  useEffect(() => {
    const handleGlobalError = (event) => {
      pushCrashLog('window-error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    };

    const handleUnhandledRejection = (event) => {
      pushCrashLog('unhandled-rejection', {
        reason: String(event.reason),
        stack: event.reason?.stack,
      });
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Initialize watchdog flags on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__PAUSE_HAND_TRACKING__ = false;
      window.__HAND_TRACKING_FPS__ = 0;
      window.__THREE_FPS__ = 60;
    }
  }, []);

  // Geometry Watchdog Sampler & Circuit Breaker (runs every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = (typeof window !== 'undefined') ? window.__THREE_RENDERER_STATS__ : null;
      const appFps = (typeof window !== 'undefined') ? (window.__THREE_FPS__ ?? 60) : 60;
      const handFps = (typeof window !== 'undefined') ? (window.__HAND_TRACKING_FPS__ ?? 0) : 0;

      if (!stats) return;

      const currentGeometries = stats.geometries;

      // Update state for realtime sidebar Card and debug modal overlay
      setRendererStats({
        ...stats,
        fps: appFps,
        handFps: handFps,
        handTrackingActive: trackingMode !== 'mouse' && handDetected,
        handHologramActive: trackingMode !== 'mouse' && handDetected,
        tagNodeActive: !isSafeMode && !fuseTriggered,
        activeModel: activeModel,
      });

      console.log(`[Geometry Watchdog] Geometries: ${currentGeometries}, Textures: ${stats.textures}, Programs: ${stats.programs}, FPS: ${appFps}, HandFPS: ${handFps}`);

      // Warning threshold: > 1000 geometries
      if (currentGeometries > 1000) {
        pushCrashLog('geometry-leak-warning', {
          geometries: currentGeometries,
          textures: stats.textures,
          programs: stats.programs,
          render: {
            calls: stats.calls,
            triangles: stats.triangles,
          },
          fps: appFps,
          handFps: handFps,
          activeModel,
          trackingMode,
        });
      }

      // Circuit breaker (熔断) threshold: > 3000 geometries
      if (currentGeometries > 3000 && !fuseTriggered) {
        setFuseTriggered(true);
        if (typeof window !== 'undefined') {
          window.__PAUSE_HAND_TRACKING__ = true;
        }
        setTrackingMode('mouse');

        pushCrashLog('circuit-breaker-triggered', {
          geometries: currentGeometries,
          textures: stats.textures,
          programs: stats.programs,
          render: {
            calls: stats.calls,
            triangles: stats.triangles,
          },
          fps: appFps,
          handFps: handFps,
          activeModel,
          trackingMode,
        });

        console.error(`[Geometry Watchdog] CIRCUIT BREAKER TRIGGERED! Geometries count ${currentGeometries} exceeded limit 3000. Paused hand tracking.`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [trackingMode, handDetected, activeModel, fuseTriggered, setTrackingMode]);

  const handleClearLogs = () => {
    try {
      localStorage.removeItem('spatial_webgl_crash_logs');
      setCrashLogs([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadLogs = () => {
    try {
      const key = 'spatial_webgl_crash_logs';
      const logs = localStorage.getItem(key) || '[]';
      const blob = new Blob([logs], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spatial_webgl_crash_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  // Reset selected part when switching models
  React.useEffect(() => {
    setSelectedPartId('01');
    setMeshList([]);
    setSelectedMeshIdx(-1);
    setHoveredMeshIdx(-1);
  }, [activeModel]);

  const handleBack = () => {
    navigate('/projects');
  };

  const partsData = activeModel === 'fridge' 
    ? FRIDGE_PARTS 
    : (activeModel === 'battery' ? BATTERY_PARTS : customTurbineParts);

  const filteredParts = Object.entries(partsData).filter(([id, item]) => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || id.includes(searchTerm)
  );

  const selectedPart = partsData[selectedPartId] || Object.values(partsData)[0];
  const activePart = hoveredPartId ? partsData[hoveredPartId] : selectedPart;

  const leftCollapsed = focusMode ? !tempTelemetryShow : leftSidebarCollapsed;
  const rightCollapsed = focusMode ? !tempConfigShow : rightSidebarCollapsed;

  // Hand gesture-driven explode control
  const lastYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastExplodeTimeRef = useRef(0);

  useEffect(() => {
    if (trackingMode !== 'mouse' && handDetected) {
      if (isPinching) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          lastYRef.current = cursor.y;
        } else {
          const now = Date.now();
          if (now - lastExplodeTimeRef.current > 33) { // Throttle setState to ~30 FPS
            const dy = cursor.y - lastYRef.current;
            // Pull up to explode, push down to assemble (using 0.14 coefficient)
            setExplodeAmount(prev => Math.max(0, Math.min(1, prev + dy * 0.14)));
            lastYRef.current = cursor.y;
            lastExplodeTimeRef.current = now;
          }
        }
      } else {
        isDraggingRef.current = false;
      }
    }
  }, [cursor.y, isPinching, handDetected, trackingMode]);

  return (
    <PageContainer>
      <Header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="nav-back" onClick={handleBack}>
            ❮ 返回
          </button>
          <div className="logo-section" onClick={() => navigate('/')}>
            <span className="icon">⚙️</span>
            <h1>3D 产品配置器</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <HeaderButton onClick={() => setShowDebugLogs(true)} style={{ borderColor: 'rgba(239, 68, 68, 0.45)', color: '#ef4444' }}>
            🛠️ 崩溃黑匣子
          </HeaderButton>
          <HeaderButton onClick={() => setCameraPreset('home')}>
            🔄 重置视角
          </HeaderButton>
        </div>
      </Header>

      <MainContent>
        {/* Sidebar collapse/expand trigger tabs */}
        <EdgeTab
          $left
          $collapsed={leftCollapsed}
          onClick={() => {
            if (focusMode) {
              setTempTelemetryShow(prev => !prev);
            } else {
              setLeftSidebarCollapsed(prev => !prev);
            }
          }}
        >
          {leftCollapsed ? '🗂️ 零件 ❯' : '❮ 收起'}
        </EdgeTab>
        
        <EdgeTab
          $collapsed={rightCollapsed}
          onClick={() => {
            if (focusMode) {
              setTempConfigShow(prev => !prev);
            } else {
              setRightSidebarCollapsed(prev => !prev);
            }
          }}
        >
          {rightCollapsed ? '⚙️ 图层 ❮' : '收起 ❯'}
        </EdgeTab>

        {/* Left Side: Telemetry Control Panel */}
        <Sidebar $left $collapsed={leftCollapsed}>
          <HudCard>
            <h3>交互模式</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem' }}>
              {[
                { label: '鼠标轨迹', mode: TRACKING_MODES.MOUSE, icon: '🖱️' },
                { label: '手势捕捉', mode: TRACKING_MODES.CAMERA, icon: '📷' },
                { label: '仿真模拟', mode: TRACKING_MODES.SIMULATE, icon: '🌀' },
                { label: '网口服务', mode: TRACKING_MODES.WEBSOCKET, icon: '🔌' }
              ].map(m => (
                <button
                  key={m.label}
                  className={`option ${trackingMode === m.mode ? 'active' : ''}`}
                  onClick={() => setTrackingMode(m.mode)}
                  style={{
                    padding: '0.45rem',
                    fontSize: '0.65rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    justifyContent: 'center',
                    background: trackingMode === m.mode ? 'rgba(37,99,235,0.08)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${trackingMode === m.mode ? '#2563eb' : 'rgba(0,0,0,0.08)'}`,
                    color: trackingMode === m.mode ? '#2563eb' : '#475569',
                    fontWeight: trackingMode === m.mode ? '700' : '500',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </HudCard>

          {trackingMode === TRACKING_MODES.WEBSOCKET && (
            <HudCard>
              <h3>WebSocket 连接设置</h3>
              <div className="slider-group" style={{ marginTop: '0.2rem' }}>
                <label>服务器地址</label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  style={{
                    background: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    color: '#1e293b',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <span className="tech-info" style={{ color: isConnected ? '#16a34a' : '#dc2626', display: 'block', marginTop: '0.2rem' }}>
                {isConnected ? '● 已连接' : '○ 未连接'}
              </span>
            </HudCard>
          )}

          <HudCard>
            <h3>追踪状态</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.4rem', fontSize: '0.72rem', color: '#475569' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                  <span>鼠标追踪</span>
                </div>
                <span style={{ color: '#16a34a', fontWeight: '600' }}>在线</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                  <span>模型加载</span>
                </div>
                <span style={{ color: '#16a34a', fontWeight: '600' }}>正常</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }} />
                  <span>数据同步</span>
                </div>
                <span style={{ color: '#16a34a', fontWeight: '600' }}>正常</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#2563eb' }} />
                  <span>拆解模式</span>
                </div>
                <span style={{ color: '#2563eb', fontWeight: '600' }}>激活</span>
              </div>
            </div>
          </HudCard>

          <HudCard>
            <h3>指针数据</h3>
            <SpecTable>
              <SpecRow>
                <span className="label">模式</span>
                <span className="val">鼠标</span>
              </SpecRow>
              <SpecRow>
                <span className="label">状态</span>
                <span className="val" style={{ color: '#16a34a', fontWeight: '600' }}>在线</span>
              </SpecRow>
              <SpecRow>
                <span className="label">X轴坐标</span>
                <span className="val">{cursor.x.toFixed(3)} m</span>
              </SpecRow>
              <SpecRow>
                <span className="label">Y轴坐标</span>
                <span className="val">{cursor.y.toFixed(3)} m</span>
              </SpecRow>
              <SpecRow>
                <span className="label">Z轴坐标</span>
                <span className="val">{isPinching ? '0.214' : '0.000'} m</span>
              </SpecRow>
              <SpecRow>
                <span className="label">当前目标</span>
                <span className="val" style={{ fontSize: '0.62rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activePart ? activePart.name : '未选定'}>
                  {activePart ? activePart.name : '无'}
                </span>
              </SpecRow>
            </SpecTable>
          </HudCard>

          <HudCard>
            <h3>性能诊断</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.3rem', fontSize: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>主循环帧率:</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {rendererStats ? `${Math.round(rendererStats.fps)} FPS` : '计算中...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>手势帧率:</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {trackingMode === 'mouse' ? '已关闭' : (rendererStats ? `${Math.round(rendererStats.handFps)} FPS` : '0 FPS')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>几何体 (Geometries):</span>
                <span style={{ color: (rendererStats?.geometries > 1000) ? '#dc2626' : '#0f172a', fontWeight: '600' }}>
                  {rendererStats?.geometries ?? '加载中...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>纹理 (Textures):</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {rendererStats?.textures ?? '加载中...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>着色器 (Programs):</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {rendererStats?.programs ?? '加载中...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.04)', paddingBottom: '0.2rem' }}>
                <span>绘制调用 (Calls):</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {rendererStats?.calls ?? '加载中...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>三角面数 (Triangles):</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>
                  {rendererStats?.triangles ? rendererStats.triangles.toLocaleString() : '加载中...'}
                </span>
              </div>

              {fuseTriggered && (
                <div style={{
                  marginTop: '0.4rem',
                  padding: '0.5rem',
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.2)',
                  borderRadius: '4px',
                  color: '#dc2626',
                  fontSize: '0.65rem',
                  lineHeight: '1.3'
                }}>
                  <strong>⚠️ 熔断保护已触发</strong><br />
                  几何体泄漏已拦截，自动暂停手势并隐藏 3D 浮动标签。<br />
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.__PAUSE_HAND_TRACKING__ = false;
                      }
                      setFuseTriggered(false);
                    }}
                    style={{
                      marginTop: '0.4rem',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '0.6rem',
                      fontWeight: 'bold',
                      width: '100%'
                    }}
                  >
                    手动重置熔断
                  </button>
                </div>
              )}
            </div>
          </HudCard>
        </Sidebar>

        {/* Center Section: R3F Canvas Container */}
        <CanvasContainer $leftCollapsed={leftCollapsed} $rightCollapsed={rightCollapsed}>
          <ErrorBoundary>
            <Canvas
              camera={{ position: [0, 0, 4.8], fov: 48 }}
              gl={{
                alpha: true,
                antialias: !isSafeMode,
                stencil: !isSafeMode,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance'
              }}
              dpr={isSafeMode ? 1 : [1, 1.25]}
              onCreated={({ gl }) => {
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.45;
              }}
            >
              <Suspense fallback={null}>
                <SpatialScene
                  activeModel={activeModel}
                  fuseTriggered={fuseTriggered}
                  explode={explodeAmount}
                  setExplode={setExplodeAmount}
                  selectedPartId={selectedPartId}
                  setSelectedPartId={setSelectedPartId}
                  fov={fov}
                  setFov={setFov}
                  autoRotate={autoRotate}
                  cameraPreset={cameraPreset}
                  setCameraPreset={setCameraPreset}
                  focusMode={focusMode}
                  setFocusMode={setFocusMode}
                  hoveredPartId={hoveredPartId}
                  setHoveredPartId={setHoveredPartId}
                  configMode={configMode && !fuseTriggered}
                  selectedMeshIdx={selectedMeshIdx}
                  setSelectedMeshIdx={setSelectedMeshIdx}
                  hoveredMeshIdx={hoveredMeshIdx}
                  setHoveredMeshIdx={setHoveredMeshIdx}
                  customTurbineParts={customTurbineParts}
                  setCustomTurbineParts={setCustomTurbineParts}
                  partMeshIndices={partMeshIndices}
                  setPartMeshIndices={setPartMeshIndices}
                  onModelLoaded={setMeshList}
                  cursorMode={cursorMode}
                />
                {!fuseTriggered && <HandHologram />}
                <OrbitControls
                  enableZoom={cursorMode === 'zoom' || cursorMode === 'orbit'}
                  enablePan={cursorMode === 'pan'}
                  enableRotate={cursorMode === 'orbit'}
                  maxDistance={8}
                  minDistance={2}
                  enabled={!handDetected}
                  onStart={() => setCameraPreset(null)}
                />
                <Preload all />
              </Suspense>
            </Canvas>
          </ErrorBoundary>

          {/* Floating Camera Control Dock */}
          <BottomDock>
            <div className="dock-section">
              <span className="label" style={{ marginRight: '0.2rem' }}>视距</span>
              <div className="zoom-control">
                <button onClick={() => setFov(prev => Math.min(85, prev + 3))} title="拉远视角">
                  ➖
                </button>
                <span className="zoom-display">
                  {Math.round((48 / fov) * 100)}%
                </span>
                <button onClick={() => setFov(prev => Math.max(15, prev - 3))} title="拉近视角">
                  ➕
                </button>
              </div>
            </div>
            
            <div className="divider" />
            
            <div className="dock-section presets-group">
              {[
                { id: 'orbit', label: '旋转', icon: '🔄' },
                { id: 'pan', label: '平移', icon: '✋' },
                { id: 'zoom', label: '缩放', icon: '🔍' },
                { id: 'select', label: '选择', icon: '🎯' }
              ].map(mode => (
                <button
                  key={mode.id}
                  className={cursorMode === mode.id ? 'active' : ''}
                  onClick={() => setCursorMode(mode.id)}
                  title={`${mode.label}模式`}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
            
            <div className="divider" />
            
            <div className="dock-section explode-control">
              <span style={{ color: '#475569', fontWeight: 600 }}>拆解</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={explodeAmount}
                onChange={(e) => setExplodeAmount(parseFloat(e.target.value))}
              />
              <span style={{ fontFamily: 'JetBrains Mono', color: '#2563eb', fontWeight: '700', minWidth: '32px' }}>
                {Math.round(explodeAmount * 100)}%
              </span>
            </div>
            
            <div className="divider" />
            
            <div className="dock-section rotate-toggle">
              <span>自动旋转</span>
              <ToggleSwitch>
                <input 
                  type="checkbox" 
                  checked={autoRotate} 
                  onChange={() => setAutoRotate(prev => !prev)} 
                />
                <span />
              </ToggleSwitch>
            </div>
            
            <div className="divider" />
            
            <button
              className={focusMode ? 'active' : ''}
              onClick={() => {
                setFocusMode(prev => {
                  const next = !prev;
                  setTempTelemetryShow(false);
                  setTempConfigShow(false);
                  return next;
                });
              }}
              style={{
                background: focusMode ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                border: '1px solid transparent',
                borderColor: focusMode ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                color: focusMode ? '#2563eb' : '#475569',
                borderRadius: '20px',
                padding: '0.35rem 0.7rem',
                fontSize: '0.72rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.2s'
              }}
            >
              🎯 {focusMode ? '退出观察' : '沉浸观察'}
            </button>
          </BottomDock>

          <div className="pip-instructions">
            💡 提示: 点击 3D 场景中的 <span style={{ color: '#2563eb', fontWeight: 900 }}>标签点位</span> 即可高亮并追踪该零件，数据在右侧面板同步更新。
            {handDetected ? ' 捏合并上下拖拽，即可空中拆解模型。' : ' 拖拽鼠标即可旋转模型，缩放手轮可调节焦距。'}
          </div>
        </CanvasContainer>

        {/* Right Side: Model Parameter Configuration */}
        <Sidebar $right $collapsed={rightCollapsed}>
          {configMode ? (
            <HudCard style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '450px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ borderLeftColor: '#d97706' }}>🔧 标签配置中心</h3>
                <button 
                  onClick={() => setConfigMode(false)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#ef4444',
                    fontSize: '0.6rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)' }}
                >
                  退出配置
                </button>
              </div>

              {activeModel !== 'turbine' ? (
                <div style={{ fontSize: '0.7rem', color: '#64748b', padding: '1rem 0' }}>
                  目前仅支持风力发电机模型的子网格标签配置。
                </div>
              ) : (
                <>
                  <span style={{ fontSize: '0.6rem', color: '#64748b' }}>
                    在下方列表或视口中直接点击以选中子网格进行全息标签绑定。
                  </span>

                  <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid rgba(0, 0, 0, 0.08)', borderRadius: '6px', padding: '0.2rem', background: 'rgba(0,0,0,0.02)', scrollbarWidth: 'thin' }}>
                    {meshList.length === 0 ? (
                      <span style={{ fontSize: '0.62rem', color: '#64748b', padding: '0.5rem', display: 'block' }}>模型网格加载中...</span>
                    ) : (
                      meshList.map((mesh) => {
                        const isMesh = mesh.isMesh;
                        if (!isMesh) return null;
                        const idx = mesh.index;
                        const name = mesh.name;
                        
                        const mappedPartId = Object.entries(partMeshIndices).find(([pid, mIdx]) => mIdx === idx)?.[0];
                        const isTagged = !!mappedPartId && !!customTurbineParts[mappedPartId];

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredMeshIdx(idx)}
                            onMouseLeave={() => setHoveredMeshIdx(-1)}
                            onClick={() => setSelectedMeshIdx(idx)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.25rem 0.45rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.62rem',
                              fontFamily: 'JetBrains Mono, monospace',
                              background: selectedMeshIdx === idx 
                                ? 'rgba(217, 119, 6, 0.08)' 
                                : (hoveredMeshIdx === idx ? 'rgba(37, 99, 235, 0.04)' : 'transparent'),
                              border: `1px solid ${selectedMeshIdx === idx 
                                ? '#d97706' 
                                : (hoveredMeshIdx === idx ? 'rgba(37, 99, 235, 0.25)' : 'transparent')}`,
                              color: isTagged ? '#2563eb' : '#475569',
                              marginBottom: '2px'
                            }}
                          >
                            <span>#{idx.toString().padStart(2, '0')} {name}</span>
                            {isTagged && (
                              <span style={{ fontSize: '0.55rem', background: 'rgba(37, 99, 235, 0.08)', padding: '0.02rem 0.2rem', borderRadius: '3px', border: '1px solid rgba(37, 99, 235, 0.25)' }}>
                                已绑定 {mappedPartId}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedMeshIdx >= 0 ? (
                    (() => {
                      const matchedPartId = Object.entries(partMeshIndices).find(([pid, idx]) => idx === selectedMeshIdx)?.[0];
                      const partInfo = matchedPartId ? customTurbineParts[matchedPartId] : null;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.4rem', flex: 1, overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706' }}>
                              配置网格 #{selectedMeshIdx}
                            </span>
                            {partInfo ? (
                              <button
                                onClick={() => {
                                  const updatedParts = { ...customTurbineParts };
                                  delete updatedParts[matchedPartId];
                                  setCustomTurbineParts(updatedParts);
                                  
                                  const updatedIndices = { ...partMeshIndices };
                                  delete updatedIndices[matchedPartId];
                                  setPartMeshIndices(updatedIndices);
                                }}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  color: '#ef4444',
                                  fontSize: '0.58rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '3px',
                                  cursor: 'pointer'
                                }}
                              >
                                移除绑定
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const newPartId = (Object.keys(customTurbineParts).length + 1).toString().padStart(2, '0');
                                  const newPart = {
                                    id: `WT-CUSTOM-${newPartId}`,
                                    name: `自定义零件 ${newPartId}`,
                                    title: `${newPartId} 自定义零件`,
                                    desc: '请输入该零件的全息描述信息。',
                                    specs: {
                                      material: '合金钢',
                                      weight: '1.0 吨',
                                      status: '正常',
                                      temp: '25.0 ℃',
                                      vibration: '0.0 mm/s',
                                      power: '---',
                                      efficiency: '95.0%'
                                    },
                                    pos: [0, 0, 0]
                                  };
                                  setCustomTurbineParts({
                                    ...customTurbineParts,
                                    [newPartId]: newPart
                                  });
                                  setPartMeshIndices({
                                    ...partMeshIndices,
                                    [newPartId]: selectedMeshIdx
                                  });
                                }}
                                style={{
                                  background: 'rgba(22, 163, 74, 0.08)',
                                  border: '1px solid rgba(22, 163, 74, 0.25)',
                                  color: '#16a34a',
                                  fontSize: '0.58rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                + 绑定全息标签
                              </button>
                            )}
                          </div>

                          {partInfo && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.62rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.3rem', alignItems: 'center' }}>
                                <label style={{ color: '#64748b' }}>标签编号 (ID):</label>
                                <input
                                  type="text"
                                  value={partInfo.id}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].id = e.target.value;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1e293b', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', outline: 'none' }}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.3rem', alignItems: 'center' }}>
                                <label style={{ color: '#64748b' }}>零件名称:</label>
                                <input
                                  type="text"
                                  value={partInfo.name}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].name = e.target.value;
                                    updated[matchedPartId].title = `${matchedPartId} ${e.target.value}`;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1e293b', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', outline: 'none' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                <label style={{ color: '#64748b' }}>描述文字:</label>
                                <textarea
                                  rows={2}
                                  value={partInfo.desc}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].desc = e.target.value;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1e293b', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', resize: 'none', outline: 'none' }}
                                />
                              </div>

                              <div style={{ borderTop: '1px dashed rgba(0,0,0,0.06)', margin: '0.2rem 0' }} />

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.6rem' }}>
                                <div>
                                  <label style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>重量规格:</label>
                                  <input
                                    type="text"
                                    value={partInfo.specs.weight}
                                    onChange={(e) => {
                                      const updated = { ...customTurbineParts };
                                      updated[matchedPartId].specs.weight = e.target.value;
                                      setCustomTurbineParts(updated);
                                    }}
                                    style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1e293b', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.58rem', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>材料特性:</label>
                                  <input
                                    type="text"
                                    value={partInfo.specs.material}
                                    onChange={(e) => {
                                      const updated = { ...customTurbineParts };
                                      updated[matchedPartId].specs.material = e.target.value;
                                      setCustomTurbineParts(updated);
                                    }}
                                    style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#1e293b', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.58rem', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(0, 0, 0, 0.08)', borderRadius: '6px', background: 'rgba(0,0,0,0.02)', padding: '1rem' }}>
                      <span style={{ fontSize: '0.62rem', color: '#64748b', textAlign: 'center' }}>未选中任何网格零件，请在 3D 视图或上方列表中选中一个部件。</span>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const exportedJson = JSON.stringify(customTurbineParts, null, 2);
                      navigator.clipboard.writeText(exportedJson);
                      alert('发电机标签配置已成功复制到剪贴板！请将其粘贴替换到 SpatialUI.jsx 中的 TURBINE_PARTS 对象中。');
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      padding: '0.45rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                      textAlign: 'center',
                      marginTop: '0.2rem',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 14px rgba(37, 99, 235, 0.3)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.2)' }}
                  >
                    💾 导出并复制代码
                  </button>
                </>
              )}
            </HudCard>
          ) : (
            <>
              <HudCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>展示对象库</h3>
                  {activeModel === 'turbine' && (
                    <button 
                      onClick={() => setConfigMode(true)}
                      style={{
                        background: 'rgba(37, 99, 235, 0.08)',
                        border: '1px solid rgba(37, 99, 235, 0.25)',
                        color: '#2563eb',
                        fontSize: '0.62rem',
                        padding: '0.18rem 0.45rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.08)' }}
                    >
                      🔧 标签配置
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.3rem' }}>
                  {[
                    { id: 'turbine', label: '风力发电机', desc: 'MW 级双馈风力发电机', icon: '⚙️' },
                    { id: 'battery', label: '电池能量包', desc: '固态聚合物电解质电池', icon: '🔋' },
                    { id: 'fridge', label: '智能冷藏柜', desc: '全息智能温控冷藏机', icon: '❄️' }
                  ].map(item => (
                    <ObjectItem
                      key={item.id}
                      $active={activeModel === item.id}
                      onClick={() => {
                        setActiveModel(item.id);
                      }}
                    >
                      <div className="label-group">
                        <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '1px' }}>{item.desc}</span>
                        </div>
                      </div>
                      <div className="status-indicator" />
                    </ObjectItem>
                  ))}
                </div>
              </HudCard>

              <HudCard>
                <h3>零件浏览器</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <SearchInput>
                    <span>🔍</span>
                    <input 
                      type="text" 
                      placeholder="搜索零件..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </SearchInput>
                  
                  <TreeContainer style={{ maxHeight: '180px', overflowY: 'auto', scrollbarWidth: 'thin' }}>
                    {filteredParts.map(([id, item]) => (
                      <TreeItem
                        key={id}
                        $active={selectedPartId === id}
                        onMouseEnter={() => setHoveredPartId(id)}
                        onMouseLeave={() => setHoveredPartId(null)}
                        onClick={() => setSelectedPartId(id)}
                      >
                        <span style={{ color: selectedPartId === id ? '#2563eb' : '#64748b' }}>{id}</span>
                        <span>{item.name}</span>
                      </TreeItem>
                    ))}
                  </TreeContainer>
                </div>
              </HudCard>

              <HudCard>
                <h3>
                  组件数据详情
                  {hoveredPartId && (
                    <span style={{ color: '#2563eb', fontSize: '0.62rem', marginLeft: '0.4rem', fontWeight: 500, letterSpacing: '0.01em' }}>
                      (实时预览)
                    </span>
                  )}
                </h3>
                {activePart ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: hoveredPartId ? '#2563eb' : '#0f172a', transition: 'color 0.2s' }}>
                        {activePart.name}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontFamily: 'JetBrains Mono', background: 'rgba(37, 99, 235, 0.06)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.18)', color: '#2563eb' }}>
                        {activePart.id}
                      </span>
                    </div>
                    
                    <p style={{ margin: 0, fontSize: '0.68rem', color: '#475569', lineHeight: 1.45 }}>
                      {activePart.desc}
                    </p>
                    
                    <div style={{ height: '1px', background: 'rgba(0, 0, 0, 0.06)', margin: '0.2rem 0' }} />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.6rem', fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace', color: '#475569' }}>
                      <div>材料: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.material}</span></div>
                      <div>重量: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.weight}</span></div>
                      <div>状态: <span style={{ color: activePart.specs.status.includes('Active') || activePart.specs.status.includes('Running') || activePart.specs.status.includes('Healthy') || activePart.specs.status.includes('Online') || activePart.specs.status.includes('正常') || activePart.specs.status.includes('活动') || activePart.specs.status.includes('运行') || activePart.specs.status.includes('在线') ? '#16a34a' : '#d97706', fontWeight: '600' }}>
                        {activePart.specs.status}
                      </span></div>
                      <div>温度: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.temp}</span></div>
                      {activePart.specs.vibration && activePart.specs.vibration !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>振动: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.vibration}</span></div>
                      )}
                      {activePart.specs.power && activePart.specs.power !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>功率: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.power}</span></div>
                      )}
                      {activePart.specs.efficiency && activePart.specs.efficiency !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>效率: <span style={{ color: '#1e293b', fontWeight: '500' }}>{activePart.specs.efficiency}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>请选择或悬停零件以查看其全息遥测参数</span>
                )}
              </HudCard>
            </>
          )}
        </Sidebar>
      </MainContent>

      {showDebugLogs && (
        <DebugModalOverlay onClick={() => setShowDebugLogs(false)}>
          <DebugModalContent onClick={(e) => e.stopPropagation()}>
            <div className="debug-header">
              <h2>🛠️ WebGL 崩溃黑匣子日志 (最近80条)</h2>
              <button className="close-btn" onClick={() => setShowDebugLogs(false)}>×</button>
            </div>

            {/* Real-time Watchdog Overlay inside Debug Modal */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderBottom: '1px solid rgba(231, 199, 126, 0.15)',
              padding: '1rem 1.2rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.8rem',
              fontSize: '0.75rem',
              lineHeight: '1.4'
            }}>
              <div>主循环帧率: <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{rendererStats ? `${Math.round(rendererStats.fps)} FPS` : '计算中...'}</span></div>
              <div>手势帧率: <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{trackingMode === 'mouse' ? '已关闭' : (rendererStats ? `${Math.round(rendererStats.handFps)} FPS` : '0 FPS')}</span></div>
              <div>几何体 (Geometries): <span style={{ color: (rendererStats?.geometries > 1000) ? '#ef4444' : '#38bdf8', fontWeight: 'bold' }}>{rendererStats?.geometries ?? '加载中...'}</span></div>
              <div>纹理 (Textures): <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{rendererStats?.textures ?? '加载中...'}</span></div>
              <div>着色器 (Programs): <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{rendererStats?.programs ?? '加载中...'}</span></div>
              <div>绘制调用 (Calls): <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{rendererStats?.calls ?? '加载中...'}</span></div>
              <div>三角面数 (Triangles): <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{rendererStats?.triangles ? rendererStats.triangles.toLocaleString() : '加载中...'}</span></div>
              <div>手势追踪 (Tracking): <span style={{ color: trackingMode !== 'mouse' ? '#38bdf8' : '#94a3b8', fontWeight: 'bold' }}>{trackingMode !== 'mouse' ? '开启' : '关闭'}</span></div>
              <div>手势骨架 (Hologram): <span style={{ color: (trackingMode !== 'mouse' && !fuseTriggered) ? '#38bdf8' : '#94a3b8', fontWeight: 'bold' }}>{(trackingMode !== 'mouse' && !fuseTriggered) ? '显示中' : '已隐藏'}</span></div>
              <div>三维标签 (TagNode): <span style={{ color: (!isSafeMode && !fuseTriggered) ? '#38bdf8' : '#94a3b8', fontWeight: 'bold' }}>{(!isSafeMode && !fuseTriggered) ? '显示中' : '已隐藏'}</span></div>
              <div>活动模型 (Model): <span style={{ color: '#e7c77e', fontWeight: 'bold' }}>{activeModel}</span></div>
              <div>熔断保护状态: <span style={{ color: fuseTriggered ? '#ef4444' : '#16a34a', fontWeight: 'bold' }}>{fuseTriggered ? '⚠️ 触发熔断保护' : '● 正常运行'}</span></div>
            </div>

            <div className="debug-actions">
              <button className="btn-action" onClick={handleDownloadLogs}>下载 JSON</button>
              <button className="btn-action btn-secondary" onClick={handleClearLogs}>清空日志</button>
            </div>
            <div className="debug-list">
              {crashLogs.length === 0 ? (
                <div className="empty-log">暂无崩溃日志记录</div>
              ) : (
                crashLogs.map((log, i) => (
                  <div className="debug-item" key={i}>
                    <div className="debug-time">{new Date(log.time).toLocaleString()}</div>
                    <div className="debug-type" style={{ color: log.type === 'webglcontextlost' || log.type === 'window-error' ? '#ef4444' : '#38bdf8' }}>
                      [{log.type.toUpperCase()}]
                    </div>
                    <pre className="debug-payload">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </DebugModalContent>
        </DebugModalOverlay>
      )}
    </PageContainer>
  );
}
