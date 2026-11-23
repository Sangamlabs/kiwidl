import React from 'react';
import { AnimeResult, MediaInfo, SongResult } from '../lib/docksApi';
import { COPY, TabId } from '../lib/docksLogic';
import { PlatformIcon } from './Icons';

interface ResultCardProps {
  cardRef: React.RefObject<HTMLDivElement | null>;
  tab: TabId;
  mediaInfo: MediaInfo | null;
  songResult: SongResult | null;
  animeResult?: AnimeResult | null;
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
  animeResult,
  isWorking,
  onDownload,
  onDownloadAllImages,
  onGetSongMp3,
}: ResultCardProps) {
  if (tab === 'anime' || animeResult) {
    if (!animeResult) return null;

    if (!animeResult.found) {
      return (
        <div className="result-card anime-card" ref={cardRef} data-testid="result-card">
          <h2 className="nomatch-title">{COPY.noAnimeTitle}</h2>
          <p className="nomatch-copy">{animeResult.message || COPY.noAnimeBody}</p>
        </div>
      );
    }

    const similarity = animeResult.similarity ?? 0;
    const isLowConfidence = similarity < 85;

    return (
      <div className="result-card anime-card" ref={cardRef} data-testid="result-card">
        <div className="anime-layout">
          <div className="anime-preview-box">
            {animeResult.previewVideo ? (
              <video
                src={animeResult.previewVideo}
                poster={animeResult.previewImage}
                autoPlay
                muted
                loop
                playsInline
                className="anime-preview-video"
              />
            ) : animeResult.previewImage ? (
              <img
                src={animeResult.previewImage}
                alt={animeResult.title || 'Anime Preview'}
                className="anime-preview-img"
              />
            ) : null}
          </div>

          <div className="anime-details">
            <div className="anime-badge-row">
              <span
                className={`anime-confidence-badge ${isLowConfidence ? 'warning' : 'high'}`}
              >
                {isLowConfidence ? '⚠️ ' : '🎯 '}
                {similarity.toFixed(1)}% Match
                {isLowConfidence ? ' (Low Match)' : ''}
              </span>
              {animeResult.isAdult && (
                <span className="anime-adult-badge">18+</span>
              )}
            </div>

            {isLowConfidence && (
              <div
                style={{
                  margin: '8px 0 12px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: '#fef9c3',
                  border: '1.5px dashed #ca8a04',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  color: '#854d0e',
                }}
              >
                ⚠️ <strong>Uncertain Match:</strong> This clip appears to have template overlays (e.g. Twitter card), heavy color filters, or cropped framing. The title below is only an approximate visual guess. For 95%+ exact match, use a clean unedited clip.
              </div>
            )}

            <h2 className="anime-title">{animeResult.title}</h2>

            {animeResult.romajiTitle && animeResult.romajiTitle.toLowerCase() !== animeResult.title?.toLowerCase() && (
              <div className="anime-romaji">
                <span className="anime-label">Romaji:</span> {animeResult.romajiTitle}
              </div>
            )}

            {animeResult.nativeTitle && (
              <div className="anime-native">
                <span className="anime-label">Japanese:</span> {animeResult.nativeTitle}
              </div>
            )}

            <div className="anime-meta-grid">
              <div className="anime-meta-item">
                <span className="anime-meta-label">📺 Episode</span>
                <span className="anime-meta-value">{animeResult.episode || 'N/A'}</span>
              </div>
              <div className="anime-meta-item">
                <span className="anime-meta-label">⏱ Scene Time</span>
                <span className="anime-meta-value">{animeResult.timestamp || '00:00'}</span>
              </div>
            </div>

            {animeResult.previewVideo && (
              <div className="anime-actions">
                <a
                  href={animeResult.previewVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill solid"
                >
                  Open Full Scene Clip
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Fallback Section: Other Possible Matches (when confidence < 88%) */}
        {similarity < 88 && animeResult.matches && animeResult.matches.length > 1 && (
          <div className="anime-alternatives">
            <div className="anime-alt-header">
              <div className="anime-alt-badge-wrap">
                <span className="anime-alt-badge">💡 Alternate Detections</span>
              </div>
              <h3 className="anime-alt-title">Not this one? Other possible matches:</h3>
              <p className="anime-alt-subtitle">
                Heavy color grading, top/bottom meme text, or crop framing can skew matches. Check these other detections:
              </p>
            </div>
            <div className="anime-alt-grid">
              {animeResult.matches.slice(1, 3).map((alt, idx) => (
                <div className="anime-alt-card" key={`${alt.title}-${idx}`}>
                  <div className="anime-alt-media">
                    {alt.previewVideo ? (
                      <video
                        src={alt.previewVideo}
                        poster={alt.previewImage}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="anime-alt-video"
                      />
                    ) : alt.previewImage ? (
                      <img
                        src={alt.previewImage}
                        alt={alt.title}
                        className="anime-alt-img"
                      />
                    ) : null}
                    <span
                      className={`anime-confidence-badge ${
                        alt.similarity < 85 ? 'warning' : 'high'
                      } anime-alt-conf`}
                    >
                      {alt.similarity.toFixed(1)}% Match
                    </span>
                  </div>
                  <div className="anime-alt-info">
                    <h4 className="anime-alt-name">{alt.title}</h4>
                    {alt.romajiTitle &&
                      alt.romajiTitle.toLowerCase() !== alt.title.toLowerCase() && (
                        <div className="anime-alt-romaji">{alt.romajiTitle}</div>
                      )}
                    <div className="anime-alt-meta">
                      <span>📺 {alt.episode || 'N/A'}</span>
                      <span>⏱ {alt.timestamp || '00:00'}</span>
                    </div>
                    {alt.previewVideo && (
                      <a
                        href={alt.previewVideo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pill anime-alt-btn"
                      >
                        Open Clip ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
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
