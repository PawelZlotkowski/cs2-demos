import { useEffect } from 'react';
import { useStore } from '../state/store';
import { AddMatchWindow } from '../windows/AddMatchWindow';
import { CoachWindow } from '../windows/CoachWindow';
import { LabWindow } from '../windows/LabWindow';
import { MatchesWindow } from '../windows/MatchesWindow';
import { ProgressWindow } from '../windows/ProgressWindow';
import { SettingsWindow } from '../windows/SettingsWindow';
import { StudioWindow } from '../windows/StudioWindow';
import { Dock } from './Dock';
import { MenuBar } from './MenuBar';
import { Notices } from './Notices';

export function Desktop() {
  const { wins, open, lab } = useStore();

  useEffect(() => {
    open('matches');
  }, [open]);

  return (
    <div className="desktop">
      <MenuBar />
      {wins.matches.open ? <MatchesWindow /> : null}
      {wins.addMatch.open ? <AddMatchWindow /> : null}
      {wins.studio.open ? <StudioWindow /> : null}
      {wins.progress.open ? <ProgressWindow /> : null}
      {wins.coach.open ? <CoachWindow /> : null}
      {wins.settings.open ? <SettingsWindow /> : null}
      {lab && wins.lab.open ? <LabWindow /> : null}
      <Notices />
      <Dock />
    </div>
  );
}
