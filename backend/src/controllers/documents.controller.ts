import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { documentTemplateService } from "../services/documentTemplate.service";

class DocumentsController {
  getTemplates = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const templates = documentTemplateService.listTemplates();

      res.status(200).json({
        success: true,
        data: templates.map(({ id, name, kind, description }) => ({
          id,
          name,
          kind,
          description,
        })),
      });
    },
  );
}

export const documentsController = new DocumentsController();