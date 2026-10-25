from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from .data import SignVideoDataset, read_split
from .model import TemporalSignClassifier


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an ASL-Citizen isolated-sign classifier.")
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("artifacts/asl_sign_model.pt"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--frames", type=int, default=16)
    parser.add_argument("--image-size", type=int, default=112)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--limit", type=int, help="Limit rows per split for a quick smoke run.")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    return parser.parse_args()


def choose_device(requested: str) -> torch.device:
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested, but PyTorch cannot access a CUDA device")
    if requested == "auto":
        requested = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(requested)


def run_epoch(
    model: TemporalSignClassifier,
    loader: DataLoader,
    loss_fn: nn.Module,
    device: torch.device,
    optimizer: torch.optim.Optimizer | None = None,
) -> tuple[float, float]:
    training = optimizer is not None
    model.train(training)
    total_loss = 0.0
    correct = 0
    count = 0

    for frames, labels in loader:
        frames = frames.to(device)
        labels = labels.to(device)
        if training:
            optimizer.zero_grad(set_to_none=True)
        with torch.set_grad_enabled(training):
            logits = model(frames)
            loss = loss_fn(logits, labels)
            if training:
                loss.backward()
                optimizer.step()

        batch_count = labels.size(0)
        total_loss += loss.item() * batch_count
        correct += (logits.argmax(dim=1) == labels).sum().item()
        count += batch_count

    if count == 0:
        raise ValueError("The data loader produced no samples")
    return total_loss / count, correct / count


def main() -> None:
    args = parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.workers < 0:
        raise ValueError("epochs and batch-size must be positive; workers cannot be negative")
    if args.limit is not None and args.limit < 1:
        raise ValueError("limit must be positive")

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = choose_device(args.device)

    split_dir = args.dataset_root / "splits"
    video_dir = args.dataset_root / "videos"
    train_records = read_split(split_dir / "train.csv")
    val_records = read_split(split_dir / "val.csv")
    if args.limit is not None:
        train_records = train_records[: args.limit]

    classes = sorted({record.gloss for record in train_records})
    label_to_id = {label: index for index, label in enumerate(classes)}
    unseen = sorted({record.gloss for record in val_records}.difference(label_to_id))
    if args.limit is not None:
        val_records = [record for record in val_records if record.gloss in label_to_id][
            : args.limit
        ]
        unseen = []
    if unseen:
        raise ValueError(
            f"Validation contains {len(unseen)} glosses absent from train; "
            "cannot compute a valid closed-set validation score."
        )
    if not val_records:
        raise ValueError("No validation clips overlap the training vocabulary.")

    train_data = SignVideoDataset(
        train_records, video_dir, label_to_id, args.frames, args.image_size
    )
    val_data = SignVideoDataset(
        val_records, video_dir, label_to_id, args.frames, args.image_size
    )
    train_loader = DataLoader(
        train_data,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(
        val_data,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )

    model = TemporalSignClassifier(class_count=len(classes)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    loss_fn = nn.CrossEntropyLoss()
    best_accuracy = -1.0
    args.output.parent.mkdir(parents=True, exist_ok=True)

    print(
        f"Training {len(train_records)} clips, validating {len(val_records)} clips, "
        f"{len(classes)} glosses on {device}."
    )
    for epoch in range(1, args.epochs + 1):
        train_loss, train_accuracy = run_epoch(
            model, train_loader, loss_fn, device, optimizer
        )
        val_loss, val_accuracy = run_epoch(model, val_loader, loss_fn, device)
        print(
            f"epoch={epoch}/{args.epochs} "
            f"train_loss={train_loss:.4f} train_top1={train_accuracy:.4f} "
            f"val_loss={val_loss:.4f} val_top1={val_accuracy:.4f}"
        )
        if val_accuracy > best_accuracy:
            best_accuracy = val_accuracy
            torch.save(
                {
                    "version": "asl-citizen-video-gloss-v1",
                    "state_dict": model.state_dict(),
                    "classes": classes,
                    "frame_count": args.frames,
                    "image_size": args.image_size,
                    "validation_top1": val_accuracy,
                },
                args.output,
            )
            print(f"Saved best checkpoint: {args.output}")

    print(f"Best validation top-1 accuracy: {best_accuracy:.4f}")
    print("The test split was not used; evaluate it only after model selection.")


if __name__ == "__main__":
    main()
