import React from 'react';
import { MediaInfo, SongResult } from '../lib/docksApi';
import { COPY, TabId } from '../lib/docksLogic';
import { PlatformIcon } from './Icons';

interface ResultCardProps {
  cardRef: React.RefObject<HTMLDivElement | null>;
  tab: TabId;
  mediaInfo: MediaInfo | null;
  songResult: SongResult | null;
  isWorking: boolean;
  onDownload: (type: 'video' | 'audio' | 'image', quality: string) => void;
  onDownloadAllImages: (count: number) => void;
  onGetSongMp3: () => void;
}

export function ResultCard({
  cardRef,
  tab,
  mediaInfo,
  songResult,
  isWorking,
  onDownload,
  onDownloadAllImages,
  onGetSongMp3,
}: ResultCardProps) {
  if (tab === 'song') {
    if (!songResult) return null;

    if (!songResult.found) {
      return (
        <div className="result-card" ref={cardRef} data-testid="result-card">
          <h2 className="nomatch-title">{COPY.noMatchTitle}</h2>
          <p className="nomatch-copy">{COPY.noMatchBody}</p>
        </div>
      );
    }

    return (
      <div className="result-card" ref={cardRef} data-testid="result-card">
        <div className="song-layout">
          <div
            className="song-cover"
            style={
              songResult.cover
                ? { backgroundImage: `url("${songResult.cover}")` }
                : undefined
            }
            role="img"
            aria-label={`${songResult.title || 'Song'} cover art`}
          />
          <div className="song-body">
            <div className="eb song-artist">{songResult.artist || 'Unknown Artist'}</div>
            <h2 className="song-title">{songResult.title || 'Unknown Track'}</h2>
            <div className="song-actions">
              <button
                type="button"
                className="pill solid"
                disabled={isWorking}
                onClick={onGetSongMp3}
              >
                Get MP3
              </button>
              {songResult.shazam_url && (
                <a
                  href={songResult.shazam_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill"
                >
                  Open in Shazam
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!mediaInfo) return null;

  if (tab === 'post') {
    if (mediaInfo.images.length === 0) {
      return (
        <div className="result-card" ref={cardRef} data-testid="result-card">
          <p className="empty-tab-copy">{COPY.emptyTab}</p>
        </div>
      );
    }

    return (
      <div className="result-card" ref={cardRef} data-testid="result-card">
        <div className="post-head">
          <h2 className="media-title">{mediaInfo.title}</h2>
          <div className="media-meta">
            {[mediaInfo.author, mediaInfo.duration].filter(Boolean).join(', ')}
          </div>
        </div>
        <div className="post-grid">
          {mediaInfo.images.map((img, i) => (
            <div className="post-tile" key={`${img.label}-${i}`}>
              <div
                className="post-img"
                style={{ backgroundImage: `url("${img.url}")` }}
                role="img"
                aria-label={img.label}
              />
              <button
                type="button"
                className="pill dl-pill"
                disabled={isWorking}
                aria-label={`Download ${img.label}`}
                onClick={() => onDownload('image', img.label)}
              >
                Download
              </button>
            </div>
          ))}
        </div>
        {mediaInfo.images.length > 1 && (
          <button
            type="button"
            className="pill solid post-all-btn"
            disabled={isWorking}
            onClick={() => onDownloadAllImages(mediaInfo.images.length)}
          >
            Download all ({mediaInfo.images.length})
          </button>
        )}
      </div>
    );
  }

  const options = tab === 'video' ? mediaInfo.video : mediaInfo.audio;
  if (options.length === 0) {
    return (
      <div className="result-card" ref={cardRef} data-testid="result-card">
        <p className="empty-tab-copy">{COPY.emptyTab}</p>
      </div>
    );
  }

  return (
    <div className="result-card" ref={cardRef} data-testid="result-card">
      <div className="media-head">
        <div
          className="media-thumb"
          style={
            mediaInfo.thumbnail
              ? { backgroundImage: `url("${mediaInfo.thumbnail}")` }
              : undefined
          }
          role="img"
          aria-label={`${mediaInfo.title} thumbnail`}
        >
          {!mediaInfo.thumbnail && (
            <PlatformIcon platform={mediaInfo.platform} className="mark-icon" />
          )}
        </div>
        <div className="media-info">
          <h2 className="media-title">{mediaInfo.title}</h2>
          <div className="media-meta">
            {[mediaInfo.author, mediaInfo.duration].filter(Boolean).join(', ')}
          </div>
        </div>
      </div>

      <div className="options-list">
        {options.map((opt) => (
          <div className="option-row" key={opt.label}>
            <div className="option-left">
              <span className="option-label">{opt.label}</span>
              <span className="option-size">{opt.size}</span>
            </div>
            <button
              type="button"
              className="pill dl-pill"
              disabled={isWorking}
              aria-label={`Download ${opt.label}`}
              onClick={() => onDownload(tab, opt.label)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
