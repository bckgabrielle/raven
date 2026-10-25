from __future__ import annotations

import torch
from torch import nn


class TemporalSignClassifier(nn.Module):
    """Classify an isolated sign from a fixed-length sequence of RGB frames."""

    def __init__(self, class_count: int, hidden_size: int = 192) -> None:
        super().__init__()
        if class_count < 1:
            raise ValueError("class_count must be positive")

        self.frame_encoder = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=5, stride=2, padding=2, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
        )
        self.temporal_encoder = nn.GRU(
            input_size=128,
            hidden_size=hidden_size,
            batch_first=True,
            bidirectional=True,
        )
        self.classifier = nn.Sequential(
            nn.Dropout(0.25),
            nn.Linear(hidden_size * 2, class_count),
        )

    def forward(self, frames: torch.Tensor) -> torch.Tensor:
        if frames.ndim != 5 or frames.shape[2] != 3:
            raise ValueError("Expected input shaped [batch, time, 3, height, width]")
        batch_size, time_steps, channels, height, width = frames.shape
        encoded = self.frame_encoder(
            frames.reshape(batch_size * time_steps, channels, height, width)
        )
        encoded = encoded.reshape(batch_size, time_steps, -1)
        sequence, _ = self.temporal_encoder(encoded)
        pooled = sequence.mean(dim=1)
        return self.classifier(pooled)
