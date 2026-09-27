import { useEffect } from 'react';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { AddMatchWindow } from '../windows/AddMatchWindow';
import { CoachWindow } from '../windows/CoachWindow';
import { AdminWindow } from '../windows/AdminWindow';
import { MatchesWindow } from '../windows/MatchesWindow';
import { ProgressWindow } from '../windows/ProgressWindow';
import { ReviewsWindow } from '../windows/ReviewsWindow';
import { SettingsWindow } from '../windows/SettingsWindow';
import { StudioWindow } from '../windows/StudioWindow';
import { Dock } from './Dock';
import { MenuBar } from './MenuBar';
import { Notices } from './Notices';
import { WindowBoundary } from './WindowBoundary';

export function Desktop() {
  const { wins, open, openSettings } = useStore();
  const { canLab, arrival } = useAuth();

  useEffect(() => {
    open('matches');
  }, [open]);

  // Back from linking Steam in Settings (or from an error there)
  useEffect(() => {
    if (arrival.kind !== 'settings') return;
    openSettings('account');
  }, [arrival.kind, openSettings]);

  return (
    <div className="desktop">
      <MenuBar />
      {wins.matches.open ? (
        <WindowBoundary id="matches">
          <MatchesWindow />
        </WindowBoundary>
      ) : null}
      {wins.addMatch.open ? (
        <WindowBoundary id="addMatch">
          <AddMatchWindow />
        </WindowBoundary>
      ) : null}
      {wins.studio.open ? (
        <WindowBoundary id="studio">
          <StudioWindow />
        </WindowBoundary>
      ) : null}
      {wins.progress.open ? (
        <WindowBoundary id="progress">
          <ProgressWindow />
        </WindowBoundary>
      ) : null}
      {wins.coach.open ? (
        <WindowBoundary id="coach">
          <CoachWindow />
        </WindowBoundary>
      ) : null}
      {wins.settings.open ? (
        <WindowBoundary id="settings">
          <SettingsWindow />
        </WindowBoundary>
      ) : null}
      {canLab && wins.admin.open ? (
        <WindowBoundary id="admin">
          <AdminWindow />
        </WindowBoundary>
      ) : null}
      {wins.reviews.open ? (
        <WindowBoundary id="reviews">
          <ReviewsWindow />
        </WindowBoundary>
      ) : null}
      <Notices />
      <Dock />
    </div>
  );
}
