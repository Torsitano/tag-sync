import { EC2Client, Snapshot, Tag, Volume } from '@aws-sdk/client-ec2'
import { applyTagsToResources } from './tagUtils'


export async function applyVolumeTagsToSnapshots( ec2Client: EC2Client, volumes: Map<string, Volume>, snapshots: Map<string, Snapshot>, isDryRun: boolean ) {
    for ( const snapshot of snapshots.values() ) {
        const tagsToApply: Tag[] = []

        const volume = volumes.get( snapshot.VolumeId! )
        if ( volume ) {
            for ( const tag of volume.Tags || [] ) {
                // check if the tag is already on the snapshot, if not, add it to the tags to apply
                // Tag value must also match the value on the volume
                const existingTag = snapshot.Tags?.find( sTag => sTag.Key === tag.Key && sTag.Value === tag.Value )
                if ( !existingTag ) {
                    console.log( `Adding tag '${tag.Key}' on snapshot '${snapshot.SnapshotId}' from volume '${volume.VolumeId}'` )
                    tagsToApply.push( { Key: tag.Key!, Value: tag.Value! } )
                }
            }
        }

        if ( tagsToApply.length > 0 ) {
            await applyTagsToResources( {
                ec2Client,
                resourceIds: [ snapshot.SnapshotId! ],
                tags: tagsToApply,
                isDryRun: isDryRun,
                resourceType: 'snapshot',
                resourceName: snapshot.SnapshotId!
            } )
        } else {
            console.log( `No tags to apply to snapshot '${snapshot.SnapshotId}'` )
        }
    }
}