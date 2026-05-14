import { useEffect, useRef, useState } from "react";
import { Loader2, Camera, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { members as t } from "@/strings/members";

type Stage = "starting" | "live" | "preview" | "error";
type ErrorKind = "notFound" | "denied" | "generic";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCapture(dataUrl: string): void;
}

// CameraCaptureModal — captura una foto con la webcam del operador.
// Lifecycle del MediaStream encerrado dentro del modal: arranca al
// abrir, se detiene en TODA salida (cerrar, capturar+usar, capturar+
// volver-a-tomar). Si no apagamos los tracks, la luz indicadora de la
// cámara queda encendida y el operador asume que Tinta sigue mirando —
// mal mensaje en un equipo compartido del gimnasio.
export function CameraCaptureModal({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("starting");
  const [errorKind, setErrorKind] = useState<ErrorKind>("generic");
  const [snapshot, setSnapshot] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startStream() {
    setStage("starting");
    setSnapshot(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStage("live");
    } catch (err) {
      const name = (err as DOMException | undefined)?.name ?? "";
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorKind("notFound");
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorKind("denied");
      } else {
        setErrorKind("generic");
      }
      setStage("error");
    }
  }

  useEffect(() => {
    if (open) {
      startStream();
    } else {
      stopStream();
      setSnapshot(null);
    }
    return () => {
      stopStream();
    };
  }, [open]);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSnapshot(dataUrl);
    // Apagamos la cámara apenas tomamos el shot — la preview es desde
    // el data URL, no del stream vivo. Evita el "ojo encendido" mientras
    // el operador decide si la usa.
    stopStream();
    setStage("preview");
  }

  function retake() {
    startStream();
  }

  function use() {
    if (!snapshot) return;
    onCapture(snapshot);
    onOpenChange(false);
  }

  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) stopStream();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.form.camera.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-black">
            {stage === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">{t.form.camera.starting}</p>
              </div>
            )}
            {stage === "error" && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t.form.camera.errors[errorKind]}
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={
                stage === "live"
                  ? "h-full w-full object-cover [transform:scaleX(-1)]"
                  : "hidden"
              }
            />
            {stage === "preview" && snapshot && (
              // El video live va espejado (CSS) porque es lo natural para
              // una selfie cam — el operador se ve "como en un espejo".
              // El snapshot NO va espejado: es la captura cruda del canvas,
              // y así es como queda guardado y se verá en el perfil del
              // socio. Mantener consistencia preview→stored evita el "la
              // foto que aprobé no es la que se guardó".
              <img src={snapshot} alt="" className="h-full w-full object-cover" />
            )}
          </div>

          {stage === "live" && (
            <p className="text-sm text-muted-foreground text-center">
              {t.form.camera.hint}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              {t.form.camera.cancel}
            </Button>
            {stage === "live" && (
              <Button type="button" onClick={capture}>
                <Camera className="h-4 w-4 mr-2" />
                {t.form.camera.capture}
              </Button>
            )}
            {stage === "preview" && (
              <>
                <Button type="button" variant="outline" onClick={retake}>
                  {t.form.camera.retake}
                </Button>
                <Button type="button" onClick={use}>
                  {t.form.camera.use}
                </Button>
              </>
            )}
            {stage === "error" && errorKind !== "notFound" && (
              <Button type="button" onClick={startStream}>
                {t.form.camera.capture}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
