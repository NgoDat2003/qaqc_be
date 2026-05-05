import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding...')

  // Clean existing data
  await prisma.evidence.deleteMany()
  await prisma.violation.deleteMany()
  await prisma.groupScore.deleteMany()
  await prisma.actionPlan.deleteMany()
  await prisma.audit.deleteMany()
  await prisma.auditAssignment.deleteMany()
  await prisma.auditPlan.deleteMany()
  
  await prisma.checklistSectionItem.deleteMany()
  await prisma.checklistSection.deleteMany()
  await prisma.checklistForm.deleteMany()
  
  await prisma.criteria.deleteMany()
  await prisma.criteriaGroup.deleteMany()

  await prisma.roleAssignment.deleteMany()
  await prisma.store.deleteMany()
  await prisma.brand.deleteMany()
  await prisma.user.deleteMany()

  // 1. CriteriaGroups: A(30%), B(15%), C(15%), D(40%)
  const groupA = await prisma.criteriaGroup.create({ data: { code: 'A', name: 'ATVSTP', weight: 0.30, color: '#ef4444' } })
  const groupB = await prisma.criteriaGroup.create({ data: { code: 'B', name: 'Dịch vụ', weight: 0.15, color: '#3b82f6' } })
  const groupC = await prisma.criteriaGroup.create({ data: { code: 'C', name: 'Chất lượng', weight: 0.15, color: '#10b981' } })
  const groupD = await prisma.criteriaGroup.create({ data: { code: 'D', name: 'Vận hành', weight: 0.40, color: '#f59e0b' } })

  // Criteria
  const criteria1 = await prisma.criteria.create({ data: { code: 'A.1', groupId: groupA.id, content: 'Sàn nhà sạch sẽ', deductionPerError: 1, maxDeduction: 5, flag: 'none' } })
  const criteria2 = await prisma.criteria.create({ data: { code: 'A.2', groupId: groupA.id, content: 'Có côn trùng (Critical)', deductionPerError: 5, maxDeduction: 5, flag: 'critical' } })
  const criteria3 = await prisma.criteria.create({ data: { code: 'B.1', groupId: groupB.id, content: 'Nhân viên chào khách', deductionPerError: 1, maxDeduction: 5, flag: 'none' } })
  const criteria4 = await prisma.criteria.create({ data: { code: 'C.1', groupId: groupC.id, content: 'Sai định lượng', deductionPerError: 2, maxDeduction: 5, flag: 'none' } })
  const criteria5 = await prisma.criteria.create({ data: { code: 'D.1', groupId: groupD.id, content: 'Bảo quản nguyên liệu sai (Risk)', deductionPerError: 5, maxDeduction: 5, flag: 'risk' } })

  // 2. Brands: "Alpha Brand", "Beta Brand"
  const alphaBrand = await prisma.brand.create({ data: { code: 'ALPHA', name: 'Alpha Brand' } })
  const betaBrand = await prisma.brand.create({ data: { code: 'BETA', name: 'Beta Brand' } })

  // 3. User accounts (6 users)
  const hashedPassword = await bcrypt.hash('Test@1234', 10)

  const ca = await prisma.user.create({ data: { email: 'ca@qualityops.com', fullName: 'Company Admin', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: ca.id, roleKey: 'company_admin' } })

  const qam = await prisma.user.create({ data: { email: 'qam@qualityops.com', fullName: 'QA Manager', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: qam.id, roleKey: 'qa_manager' } })

  const qc = await prisma.user.create({ data: { email: 'qc@qualityops.com', fullName: 'QC Auditor', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: qc.id, roleKey: 'qc_auditor' } })

  const am = await prisma.user.create({ data: { email: 'am@qualityops.com', fullName: 'Area Manager', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: am.id, roleKey: 'am' } })

  const sm = await prisma.user.create({ data: { email: 'sm@qualityops.com', fullName: 'Store Manager', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: sm.id, roleKey: 'store_manager' } })

  const ev = await prisma.user.create({ data: { email: 'ev@qualityops.com', fullName: 'Executive Viewer', password: hashedPassword } })
  await prisma.roleAssignment.create({ data: { userId: ev.id, roleKey: 'executive_viewer' } })

  // 4. Stores: 5 Stores (mix standard + cloud_kitchen)
  const store1 = await prisma.store.create({ data: { code: 'ST001', name: 'Alpha Store 1', modelType: 'standard', brandId: alphaBrand.id, amId: am.id, managerId: sm.id } })
  const store2 = await prisma.store.create({ data: { code: 'ST002', name: 'Alpha Store 2', modelType: 'standard', brandId: alphaBrand.id, amId: am.id } })
  const store3 = await prisma.store.create({ data: { code: 'ST003', name: 'Beta Store 1', modelType: 'standard', brandId: betaBrand.id, amId: am.id } })
  const store4 = await prisma.store.create({ data: { code: 'CK001', name: 'Cloud Kitchen 1 (Alpha)', modelType: 'cloud_kitchen', brandId: alphaBrand.id, amId: am.id } })
  const store5 = await prisma.store.create({ data: { code: 'CK002', name: 'Cloud Kitchen 2 (Beta)', modelType: 'cloud_kitchen', brandId: betaBrand.id, amId: am.id } })

  // Link storeManager to store1
  await prisma.roleAssignment.update({
    where: { userId_roleKey: { userId: sm.id, roleKey: 'store_manager' } },
    data: { storeId: store1.id }
  })

  // 5. ChecklistForm: 1 published ChecklistForm with sections
  const checklist = await prisma.checklistForm.create({
    data: {
      name: 'Standard Audit Checklist v1',
      version: '1.0.0',
      status: 'published',
      publishedAt: new Date()
    }
  })

  // Sections
  const sectionA = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupA.id, name: 'Khu vực sàn & vệ sinh', order: 1 } })
  const sectionB = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupB.id, name: 'Khu vực quầy', order: 2 } })
  const sectionC = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupC.id, name: 'Kiểm tra món', order: 3 } })
  const sectionD = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupD.id, name: 'Lưu trữ nguyên liệu', order: 4 } })

  // Section Items
  await prisma.checklistSectionItem.create({ data: { sectionId: sectionA.id, criteriaId: criteria1.id, order: 1 } })
  await prisma.checklistSectionItem.create({ data: { sectionId: sectionA.id, criteriaId: criteria2.id, order: 2 } })
  await prisma.checklistSectionItem.create({ data: { sectionId: sectionB.id, criteriaId: criteria3.id, order: 1 } })
  await prisma.checklistSectionItem.create({ data: { sectionId: sectionC.id, criteriaId: criteria4.id, order: 1 } })
  await prisma.checklistSectionItem.create({ data: { sectionId: sectionD.id, criteriaId: criteria5.id, order: 1 } })

  console.log('Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
