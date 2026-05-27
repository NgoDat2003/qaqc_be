import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { fakerVI as faker } from '@faker-js/faker'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding 1000+ realistic fake data...')

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

  const hashedPassword = await bcrypt.hash('Test@1234', 10)

  // ==========================================
  // 1. GENERATE USERS & ROLES
  // ==========================================
  console.log('Generating Users...')
  const createUser = async (roleKey: string, count: number) => {
    const users = []
    for (let i = 0; i < count; i++) {
      const user = await prisma.user.create({
        data: {
          email: faker.internet.email().toLowerCase(),
          fullName: faker.person.fullName(),
          phone: faker.phone.number({ style: 'national' }),
          password: hashedPassword,
        }
      })
      await prisma.roleAssignment.create({
        data: { userId: user.id, roleKey }
      })
      users.push(user)
    }
    return users
  }

  // Create fixed admin for easy login
  const admin = await prisma.user.create({
    data: { email: 'admin@qualityops.com', fullName: 'Super Admin', password: hashedPassword }
  })
  await prisma.roleAssignment.create({ data: { userId: admin.id, roleKey: 'company_admin' } })

  const qamUsers = await createUser('qa_manager', 5)
  const qcUsers = await createUser('qc_auditor', 20)
  const amUsers = await createUser('am', 30)
  const smUsers = await createUser('store_manager', 150)

  // ==========================================
  // 2. GENERATE BRANDS & STORES
  // ==========================================
  console.log('Generating Brands & Stores...')
  const brandNames = ['Nova Coffee', 'Zenith Tea', 'Urban Bistro', 'Green Plate']
  const brands = []
  for (let i = 0; i < brandNames.length; i++) {
    const brand = await prisma.brand.create({
      data: { code: `BR${i + 1}`, name: brandNames[i] }
    })
    brands.push(brand)
  }

  const stores = []
  let smIndex = 0
  for (let i = 0; i < 150; i++) {
    const brand = faker.helpers.arrayElement(brands)
    const am = faker.helpers.arrayElement(amUsers)
    const sm = smUsers[smIndex]
    
    // Some stores might not have a manager yet
    if (smIndex < smUsers.length - 1) smIndex++

    const isCloudKitchen = faker.number.int({ min: 1, max: 100 }) > 85
    
    const store = await prisma.store.create({
      data: {
        code: `ST${1000 + i}`,
        name: `${brand.name} ${faker.location.street()}`,
        modelType: isCloudKitchen ? 'cloud_kitchen' : 'standard',
        brandId: brand.id,
        amId: am.id,
        managerId: sm ? sm.id : null,
        address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
        region: faker.helpers.arrayElement(['Miền Bắc', 'Miền Trung', 'Miền Nam']),
      }
    })

    if (sm) {
      await prisma.roleAssignment.updateMany({
        where: { userId: sm.id, roleKey: 'store_manager' },
        data: { storeId: store.id }
      })
    }
    stores.push(store)
  }

  // ==========================================
  // 3. GENERATE CRITERIA GROUPS & CRITERIA
  // ==========================================
  console.log('Generating Criteria & Checklists...')
  const groupA = await prisma.criteriaGroup.create({ data: { code: 'A', name: 'Vệ Sinh An Toàn Thực Phẩm', weight: 0.30, color: '#ef4444' } })
  const groupB = await prisma.criteriaGroup.create({ data: { code: 'B', name: 'Chất Lượng Dịch Vụ', weight: 0.15, color: '#3b82f6' } })
  const groupC = await prisma.criteriaGroup.create({ data: { code: 'C', name: 'Chất Lượng Món', weight: 0.15, color: '#10b981' } })
  const groupD = await prisma.criteriaGroup.create({ data: { code: 'D', name: 'Vận Hành & Khác', weight: 0.40, color: '#f59e0b' } })

  const criteriaList = [
    { code: 'A.1', group: groupA, content: 'Sàn nhà, trần nhà khu vực pha chế sạch sẽ', flag: 'none', points: 1 },
    { code: 'A.2', group: groupA, content: 'Tủ mát, tủ đông đạt chuẩn nhiệt độ quy định', flag: 'none', points: 2 },
    { code: 'A.3', group: groupA, content: 'Phát hiện côn trùng trong khu vực làm việc', flag: 'critical', points: 5 },
    { code: 'B.1', group: groupB, content: 'Nhân viên chào hỏi khách đúng tiêu chuẩn', flag: 'none', points: 1 },
    { code: 'B.2', group: groupB, content: 'Nhân viên mặc đồng phục đúng quy định', flag: 'none', points: 1 },
    { code: 'C.1', group: groupC, content: 'Định lượng nguyên liệu đúng công thức', flag: 'none', points: 2 },
    { code: 'C.2', group: groupC, content: 'Nguyên liệu hết hạn sử dụng', flag: 'risk', points: 5 },
    { code: 'D.1', group: groupD, content: 'Camera an ninh hoạt động tốt', flag: 'none', points: 1 },
    { code: 'D.2', group: groupD, content: 'Hệ thống POS, máy in bill không lỗi', flag: 'none', points: 1 }
  ]

  const createdCriteria = []
  for (const c of criteriaList) {
    const crit = await prisma.criteria.create({
      data: { code: c.code, groupId: c.group.id, name: c.content, content: c.content, deductionPerError: c.points, maxDeduction: 5, flag: c.flag }
    })
    createdCriteria.push(crit)
  }

  const checklist = await prisma.checklistForm.create({
    data: { name: 'Standard Operation Checklist', version: '2.0.0', status: 'published', publishedAt: new Date() }
  })

  const secA = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupA.id, name: 'Khu vực Vệ sinh', order: 1 } })
  const secB = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupB.id, name: 'Quầy phục vụ', order: 2 } })
  const secC = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupC.id, name: 'Kiểm tra Bar/Bếp', order: 3 } })
  const secD = await prisma.checklistSection.create({ data: { formId: checklist.id, groupId: groupD.id, name: 'Hệ thống thiết bị', order: 4 } })

  for (let i = 0; i < createdCriteria.length; i++) {
    const c = createdCriteria[i]
    let sectionId = secA.id
    if (c.code.startsWith('B')) sectionId = secB.id
    if (c.code.startsWith('C')) sectionId = secC.id
    if (c.code.startsWith('D')) sectionId = secD.id

    await prisma.checklistSectionItem.create({
      data: { sectionId, criteriaId: c.id, order: i + 1 }
    })
  }

  // ==========================================
  // 4. GENERATE AUDITS & VIOLATIONS
  // ==========================================
  console.log('Generating Audits & Violations...')
  const auditStartDate = faker.date.recent({ days: 30 })
  const auditEndDate = faker.date.soon({ days: 14, refDate: auditStartDate })
  const auditPlan = await prisma.auditPlan.create({
    data: {
      name: 'Monthly Company Audit - 2026',
      type: 'adhoc',
      scope: 'company',
      formId: checklist.id,
      status: 'open',
      startDate: auditStartDate,
      endDate: auditEndDate
    }
  })

  const auditStores = faker.helpers.shuffle(stores)
  for (const store of auditStores) {
    const qc = faker.helpers.arrayElement(qcUsers)
    const isCompleted = faker.number.int({ min: 1, max: 100 }) > 20 // 80% completed

    const assignment = await prisma.auditAssignment.create({
      data: {
        planId: auditPlan.id,
        storeId: store.id,
        auditorId: qc.id,
        status: isCompleted ? 'completed' : 'pending'
      }
    })

    if (isCompleted) {
      const finalScore = faker.number.float({ min: 55.0, max: 100.0, fractionDigits: 1 })
      let grade = 'excellent'
      if (finalScore < 70) grade = 'fail'
      else if (finalScore < 85) grade = 'pass'
      else if (finalScore < 95) grade = 'good'

      const isRisk = finalScore < 75 ? faker.datatype.boolean() : false

      const audit = await prisma.audit.create({
        data: {
          formId: checklist.id,
          storeId: store.id,
          auditorId: qc.id,
          finalScore,
          grade,
          isRiskTriggered: isRisk,
          submittedAt: faker.date.recent({ days: 15 }),
        }
      })

      // Link assignment
      await prisma.auditAssignment.update({
        where: { id: assignment.id },
        data: { auditId: audit.id }
      })

      // Generate random violations if score is not 100
      if (finalScore < 100) {
        const numViolations = faker.number.int({ min: 1, max: 5 })
        const pickedCriteria = faker.helpers.arrayElements(createdCriteria, numViolations)
        
        for (const crit of pickedCriteria) {
          await prisma.violation.create({
            data: {
              auditId: audit.id,
              criteriaId: crit.id,
              numErrors: faker.number.int({ min: 1, max: 3 }),
              note: faker.lorem.sentence(),
              isCriticalTriggered: crit.flag === 'critical' ? true : false,
              isRiskTriggered: crit.flag === 'risk' ? true : false,
            }
          })
        }
      }

      // Generate Action Plan if failed or risk
      if (grade === 'fail' || isRisk) {
        await prisma.actionPlan.create({
          data: {
            auditId: audit.id,
            storeId: store.id,
            status: faker.helpers.arrayElement(['draft', 'submitted', 'rejected', 'closed']),
            remediation: faker.lorem.paragraph(),
            deadline: faker.date.soon({ days: 7 }),
          }
        })
      }
    }
  }

  console.log('✅ Seeding completed successfully! 1000+ realistic records inserted.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
