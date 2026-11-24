import React, { useState } from 'react';
import { AnimeResult, MediaInfo, SongResult, TranscriptResult } from '../lib/docksApi';
import { COPY, TabId } from '../lib/docksLogic';
import { PlatformIcon } from './Icons';

interface ResultCardProps {
  cardRef: React.RefObject<HTMLDivElement | null>;
  tab: TabId;
  mediaInfo: MediaInfo | null;
  songResult: SongResult | null;
  animeResult?: AnimeResult | null;
  transcriptResult?: TranscriptResult | null;
  isWorking: boolean;
  onDownload: (type: 'video' | 'audio' | 'image', quality: string) => void;
  onDownloadAllImages: (count: number) => void;
  onGetSongMp3: () => void;
  onGetTranscript?: (url: string) => void;
}

export function ResultCard({
  cardRef,
  tab,
  mediaInfo,
  songResult,
  animeResult,
  transcriptResult,
  isWorking,
  onDownload,
  onDownloadAllImages,
  onGetSongMp3,
  onGetTranscript,
}: ResultCardProps) {
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyTranscript = () => {
    if (!transcriptResult) return;
    const content = showTimestamps && transcriptResult.segments?.length
      ? transcriptResult.segments.map((s) => `[${s.start}] ${s.text}`).join('\n')
      : (transcriptResult.text || transcriptResult.segments.map((s) => s.text).join(' '));
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!transcriptResult) return;
    const content = showTimestamps && transcriptResult.segments?.length
      ? transcriptResult.segments.map((s) => `[${s.start}] ${s.text}`).join('\n')
      : (transcriptResult.text || transcriptResult.segments.map((s) => s.text).join(' '));
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(transcriptResult.title || 'transcript').replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSrt = () => {
    if (!transcriptResult || !transcriptResult.srt) return;
    const blob = new Blob([transcriptResult.srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(transcriptResult.title || 'transcript').replace(/[^a-zA-Z0-9_-]/g, '_')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (tab === 'transcript' || transcriptResult) {
    if (!transcriptResult) return null;

    if (!transcriptResult.success) {
      return (
        <div className="result-card" ref={cardRef} data-testid="result-card">
          <h2 className="nomatch-title">No Transcript Found</h2>
          <p className="nomatch-copy">{transcriptResult.message || 'No captions or spoken words were detected for this link.'}</p>
        </div>
      );
    }

    return (
      <div className="result-card transcript-card" ref={cardRef} data-testid="result-card">
        <div className="transcript-head">
          <div className="transcript-meta-row">
            <span className="transcript-badge source">
              {transcriptResult.source === 'native_subtitles' ? '⚡ Official Captions' : '🤖 Gemini AI Transcribed'}
            </span>
            {transcriptResult.language && (
              <span className="transcript-badge lang">
                🌐 {transcriptResult.language.toUpperCase()}
              </span>
            )}
            {transcriptResult.duration ? (
              <span className="transcript-badge dur">
                ⏱ {Math.floor(transcriptResult.duration / 60)}:{String(Math.floor(transcriptResult.duration % 60)).padStart(2, '0')}
              </span>
            ) : null}
          </div>
          <h2 className="transcript-title">{transcriptResult.title || 'Video Transcript'}</h2>
          {transcriptResult.summary && (
            <div className="transcript-summary">
              <strong>💡 Summary:</strong> {transcriptResult.summary}
            </div>
          )}
        </div>

        <div className="transcript-toolbar">
          <label className="transcript-switch-label">
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
            />
            <span>Show Timestamps</span>
          </label>
          <div className="transcript-actions">
            <button
              type="button"
              className="pill"
              onClick={handleCopyTranscript}
            >
              {copied ? '✓ Copied!' : '📋 Copy Text'}
            </button>
            <button
              type="button"
              className="pill"
              onClick={handleDownloadTxt}
            >
              📥 Download TXT
            </button>
            {transcriptResult.srt && (
              <button
                type="button"
                className="pill"
                onClick={handleDownloadSrt}
              >
                📥 Download SRT
              </button>
            )}
          </div>
        </div>

        <div className="transcript-body">
          {showTimestamps && transcriptResult.segments && transcriptResult.segments.length > 0 ? (
            <div className="transcript-segments">
              {transcriptResult.segments.map((seg, idx) => (
                <div className="transcript-seg-row" key={idx}>
                  <span className="transcript-timestamp">[{seg.start}]</span>
                  <span className="transcript-text">{seg.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="transcript-plain">
              {transcriptResult.text || transcriptResult.segments.map((s) => s.text).join(' ')}
            </p>
          )}
        </div>
      </div>
    );
  }
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
          <div className="anime-media-col">
            <div className="anime-preview-box">
              {animeResult.previewVideo ? (
                <video
                  src={animeResult.previewVideo}
                  poster={animeResult.previewImage || animeResult.coverImage}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="anime-preview-video"
                />
              ) : (animeResult.previewImage || animeResult.coverImage) ? (
                <img
                  src={animeResult.previewImage || animeResult.coverImage}
                  alt={animeResult.title || 'Anime Preview'}
                  className="anime-preview-img"
                />
              ) : null}
            </div>
            {animeResult.coverImage && animeResult.previewVideo && (
              <div className="anime-cover-box">
                <img
                  src={animeResult.coverImage}
                  alt={animeResult.title || 'Official Cover'}
                  className="anime-cover-img"
                />
                <span className="anime-cover-badge">AniList Official</span>
              </div>
            )}
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
              {animeResult.timestampVerified ? (
                <span className="anime-verified-badge exact">
                  ✓ Exact Scene Verified
                </span>
              ) : animeResult.episodeConfidence ? (
                <span className="anime-verified-badge ai">
                  🤖 AI Detected ({animeResult.episodeConfidence})
                </span>
              ) : null}
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
                <span className="anime-meta-value">{animeResult.timestamp || 'Scene from clip'}</span>
              </div>
            </div>

            {/* Detected Characters */}
            {animeResult.characters && animeResult.characters.length > 0 && (
              <div className="anime-chars-box">
                <span className="anime-chars-label">👥 Characters:</span>
                <div className="anime-chars-list">
                  {animeResult.characters.map((char, idx) => (
                    <span className="anime-char-tag" key={idx}>
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scene Summary */}
            {animeResult.sceneSummary && (
              <div className="anime-summary-box">
                <span className="anime-summary-label">📝 Scene Description:</span>
                <p className="anime-summary-text">{animeResult.sceneSummary}</p>
              </div>
            )}

            <div className="anime-actions">
              {animeResult.previewVideo && (
                <a
                  href={animeResult.previewVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill solid"
                >
                  Open Full Scene Clip ↗
                </a>
              )}
              {animeResult.coverImage && (
                <a
                  href={animeResult.coverImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill"
                  style={{ marginLeft: animeResult.previewVideo ? '8px' : '0' }}
                >
                  View Cover Poster ↗
                </a>
              )}
            </div>
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
                        poster={alt.previewImage || alt.coverImage}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="anime-alt-video"
                      />
                    ) : (alt.previewImage || alt.coverImage) ? (
                      <img
                        src={alt.previewImage || alt.coverImage}
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
          {onGetTranscript && (
            <div style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="pill"
                style={{ padding: '6px 14px 4px', fontSize: '12px' }}
                onClick={() => onGetTranscript(mediaInfo.url || '')}
              >
                📝 Get Transcript
              </button>
            </div>
          )}
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
