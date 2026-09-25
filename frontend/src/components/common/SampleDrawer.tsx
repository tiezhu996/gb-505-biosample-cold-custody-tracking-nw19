import { Descriptions, Drawer, Tabs, Typography } from 'antd'
import type { Specimen } from '../../types/domain'
import { formatDateTime } from '../../utils/format'
import { CustodyBadge } from './CustodyBadge'
import { CustodyTimeline } from './CustodyTimeline'
import { EntityTable } from './EntityTable'
import { StatusBadge } from './StatusBadge'

export function SampleDrawer({ specimen, open, onClose }: { specimen: Specimen | null; open: boolean; onClose: () => void }) {
  return (
    <Drawer width={720} title={specimen ? `样本 ${specimen.accessionNo}` : '样本详情'} open={open} onClose={onClose}>
      {specimen && <Tabs items={[
        { key: 'profile', label: '基本信息', children: <Descriptions bordered size="small" column={2}><Descriptions.Item label="保管状态"><CustodyBadge state={specimen.state} /></Descriptions.Item><Descriptions.Item label="样本类型">{specimen.sampleType}</Descriptions.Item><Descriptions.Item label="受试者编码">{specimen.subjectCode}</Descriptions.Item><Descriptions.Item label="研究协议">{specimen.protocolCode}</Descriptions.Item><Descriptions.Item label="当前保管人">{specimen.currentCustodian}</Descriptions.Item><Descriptions.Item label="接收时间">{formatDateTime(specimen.receivedAt)}</Descriptions.Item><Descriptions.Item label="剩余体积/管数">{specimen.volumeMl} mL / {specimen.aliquotCount} 管</Descriptions.Item><Descriptions.Item label="有效期">{formatDateTime(specimen.expiresAt)}</Descriptions.Item><Descriptions.Item label="冻存容器">{specimen.storageContainer ? `${specimen.storageContainer.code} · ${specimen.storageContainer.name}` : '待分配'}</Descriptions.Item><Descriptions.Item label="位置">{specimen.position || '-'}</Descriptions.Item><Descriptions.Item label="温区">{specimen.storageContainer ? <StatusBadge value={specimen.storageContainer.temperatureZone} /> : '-'}</Descriptions.Item><Descriptions.Item label="备注" span={2}>{specimen.notes || '-'}</Descriptions.Item></Descriptions> },
        { key: 'aliquots', label: `分装台账 (${specimen.aliquots?.length || 0})`, children: <EntityTable pagination={false} dataSource={specimen.aliquots || []} emptyTitle="暂无分装台账" columns={[{ title: '冻存管编号', dataIndex: 'tubeCode' }, { title: '体积', dataIndex: 'volumeMl', render: (value) => `${value} mL` }, { title: '批次', dataIndex: 'batch' }, { title: '登记人', dataIndex: 'registeredByName' }, { title: '登记时间', dataIndex: 'registeredAt', render: formatDateTime }, { title: '备注', dataIndex: 'notes', render: (value) => value || '-' }]} /> },
        { key: 'custody', label: `交接链 (${specimen.transfers?.length || 0})`, children: <CustodyTimeline transfers={specimen.transfers || []} /> },
        { key: 'protocol', label: `协议复核 (${specimen.protocolReviews?.length || 0})`, children: specimen.protocolReviews?.length ? specimen.protocolReviews.map((review) => <div className="review-record" key={review.id}><div><StatusBadge value={review.decision} /> <Typography.Text strong>{review.protocolCode}</Typography.Text></div><Typography.Text>{review.reviewerName} · {formatDateTime(review.reviewedAt)}</Typography.Text><Typography.Paragraph type="secondary">{review.notes}</Typography.Paragraph></div>) : <Typography.Text type="secondary">暂无协议复核记录</Typography.Text> },
      ]} />}
    </Drawer>
  )
}
